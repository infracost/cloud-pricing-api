import fs from 'fs';
import axios from 'axios';
import glob from 'glob';
import config from '../config';
import { Product, Price } from '../db/types';
import { generateProductHash, generatePriceHash } from '../db/helpers';
import { upsertProducts } from '../db/upsert';

const baseUrl = 'https://cloudbilling.googleapis.com/v1';

type ServiceJson = {
  serviceId: string;
  displayName: string;
};

type SkusJson = {
  skus: ProductJson[];
  nextPageToken: string;
};

type ProductJson = {
  skuId: string;
  serviceRegions: string[];
  category: {
    serviceDisplayName: string;
    resourceFamily: string;
    resourceGroup: string;
    usageType: string;
  };
  description: string;
  pricingInfo: PricingJson[];
};

type PricingJson = {
  pricingExpression: {
    displayQuantity: number;
    usageUnitDescription: string;
    tieredRates: TieredRateJson[];
  };
  effectiveTime: string;
};

type TieredRateJson = {
  startUsageAmount: number;
  unitPrice: {
    currencyCode: string;
    units: number;
    nanos: number;
  };
};

async function update(): Promise<void> {
  await downloadAll();
  await loadAll();
}

async function downloadAll(): Promise<void> {
  const services = await getServices();
  for (const service of services) {
    try {
      await downloadService(service);
    } catch (e) {
      config.logger.error(
        `Skipping service ${service.displayName} due to error ${e}`
      );
      config.logger.error(e.stack);
    }
  }
}

async function getServices(): Promise<ServiceJson[]> {
  let nextPageToken = '';
  const services: ServiceJson[] = [];
  do {
    let nextPageParam = '';
    if (nextPageToken) {
      nextPageParam = `&pageToken=${nextPageToken}`;
    }
    const resp = await axios.get(
      `${baseUrl}/services?key=${config.gcpApiKey}${nextPageParam}`
    );
    services.push(...(<ServiceJson[]>resp.data.services));
    nextPageToken = resp.data.nextPageToken;
  } while (nextPageToken);
  return services;
}

async function downloadService(service: ServiceJson): Promise<void> {
  config.logger.info(`Downloading ${service.displayName}`);

  let nextPageToken = '';
  let pageNum = 1;
  do {
    let nextPageParam = '';
    if (nextPageToken) {
      nextPageParam = `&pageToken=${nextPageToken}`;
    }
    const resp = await axios({
      method: 'get',
      url: `${baseUrl}/services/${service.serviceId}/skus?key=${config.gcpApiKey}${nextPageParam}`,
      responseType: 'stream',
    });

    let filename = `gcp-${service.displayName}-${pageNum}`;
    filename = filename.replace(/\//g, '-');
    filename = filename.replace(/\./g, '-');
    filename = `data/${filename}.json`;
    const writer = fs.createWriteStream(filename);
    resp.data.pipe(writer);
    await new Promise((resolve) => {
      writer.on('finish', resolve);
    });

    const body = fs.readFileSync(filename);
    const json = <SkusJson>JSON.parse(body.toString());

    nextPageToken = json.nextPageToken;
    pageNum++;
  } while (nextPageToken);
}

async function loadAll(): Promise<void> {
  for (const filename of glob.sync('data/gcp-*.json')) {
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
  const json = <SkusJson>JSON.parse(body.toString());

  const products: Product[] = [];

  json.skus.forEach((productJson) => {
    productJson.serviceRegions.forEach((region) => {
      const product = parseProduct(productJson, region);
      products.push(product);
    });
  });

  await upsertProducts(products);
}

function parseProduct(productJson: ProductJson, region: string): Product {
  const product: Product = {
    productHash: '',
    sku: productJson.skuId,
    vendorName: 'gcp',
    region,
    service: productJson.category.serviceDisplayName,
    productFamily: productJson.category.resourceFamily,
    attributes: {
      description: productJson.description,
      resourceGroup: productJson.category.resourceGroup,
    },
    prices: [],
  };

  product.productHash = generateProductHash(product);
  product.prices = parsePrices(product, productJson);

  return product;
}

function parsePrices(product: Product, productJson: ProductJson): Price[] {
  const prices: Price[] = [];

  productJson.pricingInfo.forEach((pricingJson) => {
    for (let i = 0; i < pricingJson.pricingExpression.tieredRates.length; i++) {
      const tierJson = pricingJson.pricingExpression.tieredRates[i];
      const nextTierJson = pricingJson.pricingExpression.tieredRates[i + 1];

      const price: Price = {
        priceHash: '',
        purchaseOption: productJson.category.usageType,
        unit: pricingJson.pricingExpression.usageUnitDescription,
        USD: `${
          tierJson.unitPrice.units
        }.${tierJson.unitPrice.nanos.toString().padStart(9, '0')}`,
        effectiveDateStart: pricingJson.effectiveTime,
        startUsageAmount: tierJson.startUsageAmount.toString(),
        endUsageAmount: nextTierJson
          ? nextTierJson.startUsageAmount.toString()
          : undefined,
      };

      price.priceHash = generatePriceHash(product, price);

      prices.push(price);
    }
  });

  return prices;
}

export default {
  update,
};
