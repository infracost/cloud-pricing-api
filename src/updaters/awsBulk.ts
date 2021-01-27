import fs from 'fs';
import _ from 'lodash';
import axios from 'axios';
import glob from 'glob';
import config from '../config';
import { Product, Price } from '../db/types';
import { generateProductHash, generatePriceHash } from '../db/helpers';
import { upsertProducts } from '../db/upsert';

const baseUrl = 'https://pricing.us-east-1.amazonaws.com';
const indexUrl = '/offers/v1.0/aws/index.json';
const chinaIndexUrl = '/offers/v1.0/cn/index.json';
const splitByRegions = ['AmazonEC2'];

const regionMapping: { [key: string]: string } = {
  'AWS GovCloud (US)': 'us-gov-west-1',
  'AWS GovCloud (US-West)': 'us-gov-west-1',
  'AWS GovCloud (US-East)': 'us-gov-east-1',
  'US East (N. Virginia)': 'us-east-1',
  'US East (Ohio)': 'us-east-2',
  'US West (N. California)': 'us-west-1',
  'US West (Oregon)': 'us-west-2',
  'US West (Los Angeles)': 'us-west-2-lax-1',
  'US ISO East': 'us-iso-east-1',
  'US ISOB East (Ohio)': 'us-isob-east-1',
  'Canada (Central)': 'ca-central-1',
  'China (Beijing)': 'cn-north-1',
  'China (Ningxia)': 'cn-northwest-1',
  'EU (Frankfurt)': 'eu-central-1',
  'EU (Ireland)': 'eu-west-1',
  'EU (London)': 'eu-west-2',
  'EU (Milan)': 'eu-south-1',
  'EU (Paris)': 'eu-west-3',
  'EU (Stockholm)': 'eu-north-1',
  'Asia Pacific (Hong Kong)': 'ap-east-1',
  'Asia Pacific (Tokyo)': 'ap-northeast-1',
  'Asia Pacific (Seoul)': 'ap-northeast-2',
  'Asia Pacific (Osaka-Local)': 'ap-northeast-3',
  'Asia Pacific (Singapore)': 'ap-southeast-1',
  'Asia Pacific (Sydney)': 'ap-southeast-2',
  'Asia Pacific (Mumbai)': 'ap-south-1',
  'Middle East (Bahrain)': 'me-south-1',
  'South America (Sao Paulo)': 'sa-east-1',
  'Africa (Cape Town)': 'af-south-1',
};

type ProductJson = {
  sku: string;
  productFamily: string;
  attributes: {
    location: string;
    servicecode: string;
  } & { [key: string]: string };
};

type PriceJson = {
  effectiveDate: string;
  priceDimensions: {
    [key: string]: {
      unit: string;
      beginRange: string;
      endRange: string;
      description: string;
      pricePerUnit: {
        USD?: string;
        CNY?: string;
      };
    };
  };
  termAttributes?: {
    LeaseContractLength?: string;
    PurchaseOption?: string;
    OfferingClass?: string;
  };
};

type ServiceJson = {
  products: { [key: string]: ProductJson };
  terms: {
    OnDemand: { [key: string]: { [key: string]: PriceJson } };
    Reserved: { [key: string]: { [key: string]: PriceJson } };
  };
};

async function update(): Promise<void> {
  await downloadAll();
  await loadAll();
}

async function downloadAll() {
  // Download standard AWS regions
  let indexResp = await axios.get(`${baseUrl}${indexUrl}`);
  for (const offer of <Offer[]>Object.values(indexResp.data.offers)) {
    await downloadService(offer);
  }

  // Download AWS China regions
  indexResp = await axios.get(`${baseUrl}${chinaIndexUrl}`);
  for (const offer of <Offer[]>Object.values(indexResp.data.offers)) {
    await downloadService(offer, 'awscn');
  }
}

interface Offer {
  offerCode: string;
  currentRegionIndexUrl: string;
  currentVersionUrl: string;
}

interface Region {
  regionCode: string;
  currentVersionUrl: string;
}

async function downloadService(offer: Offer, prefix?: string) {
  if (!prefix) {
    prefix = 'aws'; // eslint-disable-line no-param-reassign
  }

  if (_.includes(splitByRegions, offer.offerCode)) {
    const regionResp = await axios.get(
      `${baseUrl}${offer.currentRegionIndexUrl}`
    );
    for (const region of <Region[]>Object.values(regionResp.data.regions)) {
      config.logger.info(`Downloading ${region.currentVersionUrl}`);
      const resp = await axios({
        method: 'get',
        url: `${baseUrl}${region.currentVersionUrl}`,
        responseType: 'stream',
      });
      const writer = fs.createWriteStream(
        `data/${prefix}-${offer.offerCode}-${region.regionCode}.json`
      );
      resp.data.pipe(writer);
      await new Promise((resolve) => {
        writer.on('finish', resolve);
      });
    }
  } else {
    config.logger.info(`Downloading ${offer.currentVersionUrl}`);
    const resp = await axios({
      method: 'get',
      url: `${baseUrl}${offer.currentVersionUrl}`,
      responseType: 'stream',
    });
    const writer = fs.createWriteStream(
      `data/${prefix}-${offer.offerCode}.json`
    );
    resp.data.pipe(writer);
    await new Promise((resolve) => {
      writer.on('finish', resolve);
    });
  }
}

async function loadAll(): Promise<void> {
  for (const filename of glob.sync('data/aws*.json')) {
    config.logger.info(`Processing file: ${filename}`);
    try {
      await processFile(filename);
    } catch (e) {
      config.logger.error(`Skipping file ${filename} due to error ${e}`);
      config.logger.error(e.stack);
    }
  }
}

async function processFile(filename: string): Promise<void> {
  const body = fs.readFileSync(filename);
  const json = <ServiceJson>JSON.parse(body.toString());

  const products = Object.values(json.products).map((productJson) => {
    const product = parseProduct(productJson);

    if (json.terms.OnDemand && json.terms.OnDemand[product.sku]) {
      product.prices.push(
        ...parsePrices(product, json.terms.OnDemand[product.sku], 'on_demand')
      );
    }

    if (json.terms.Reserved && json.terms.Reserved[product.sku]) {
      product.prices.push(
        ...parsePrices(product, json.terms.Reserved[product.sku], 'reserved')
      );
    }

    return product;
  });

  await upsertProducts(products);
}

function parseProduct(productJson: ProductJson) {
  const product: Product = {
    productHash: '',
    vendorName: 'aws',
    service: productJson.attributes.servicecode,
    productFamily: productJson.productFamily,
    region: regionMapping[productJson.attributes.location] || null,
    sku: productJson.sku,
    attributes: productJson.attributes,
    prices: [],
  };

  product.productHash = generateProductHash(product);

  return product;
}

function parsePrices(
  product: Product,
  priceData: { [key: string]: PriceJson },
  purchaseOption: string
): Price[] {
  const prices: Price[] = [];

  Object.values(priceData).forEach((priceItem) => {
    Object.values(priceItem.priceDimensions).forEach((priceDimension) => {
      const price: Price = {
        priceHash: '',
        purchaseOption,
        unit: priceDimension.unit,
        USD: priceDimension.pricePerUnit.USD,
        CNY: priceDimension.pricePerUnit.CNY,
        effectiveDateStart: priceItem.effectiveDate,
        startUsageAmount: priceDimension.beginRange,
        endUsageAmount: priceDimension.endRange,
        description: priceDimension.description,
      };

      if (purchaseOption === 'reserved') {
        Object.assign(price, {
          termLength:
            priceItem.termAttributes &&
            priceItem.termAttributes.LeaseContractLength,
          termPurchaseOption:
            priceItem.termAttributes && priceItem.termAttributes.PurchaseOption,
          termOfferingClass:
            priceItem.termAttributes && priceItem.termAttributes.OfferingClass,
        });
      }

      price.priceHash = generatePriceHash(product, price);

      prices.push(price);
    });
  });

  return prices;
}

export default {
  update,
};
