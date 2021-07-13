import fs from 'fs';
import axios, { AxiosResponse } from 'axios';
import glob from 'glob';
import config from '../config';
import { Product, Price } from '../db/types';
import { generateProductHash, generatePriceHash } from '../db/helpers';
import { upsertProducts } from '../db/upsert';

const baseUrl = 'https://prices.azure.com/api/retail/prices';

const reservationTermMapping: { [key: string]: string } = {
  '1 Year': '1 yr',
  '3 Years': '3 yr',
  '5 Years': '5 yr',
};

type ItemsJson = {
  Items: ProductJson[];
  nextPageToken: string;
};

type PageJson = {
  NextPageLink: string;
};

type ProductJson = {
  currencyCode: string;
  tierMinimumUnits: string;
  retailPrice: string;
  unitPrice: string;
  armRegionName: string;
  location: string;
  effectiveStartDate: string;
  meterId: string;
  meterName: string;
  productId: string;
  skuId: string;
  productName: string;
  skuName: string;
  serviceName: string;
  serviceId: string;
  serviceFamily: string;
  unitOfMeasure: string;
  type: string;
  isPrimaryMeterRegion: boolean;
  armSkuName: string;
  reservationTerm: string;
};

async function update(): Promise<void> {
  await downloadAll();
  await loadAll();
}

async function downloadAll(): Promise<PageJson[]> {
  config.logger.info(`Downloading Azure Pricing API Pages...`);

  const pages: PageJson[] = [];

  let currentPageLink: string | null = null;
  let pageNumber = 1;
  do {
    if (!currentPageLink) {
      currentPageLink = `${baseUrl}`;
    }

    const resp: AxiosResponse<PageJson> = await axios.get(currentPageLink);

    const filename = `data/az-retail-page-${pageNumber}.json`;

    const dataString = JSON.stringify(resp.data);
    fs.writeFile(filename, dataString, (err) => {
      if (err) throw err;
    });

    currentPageLink = resp.data.NextPageLink;

    pageNumber += 1;
    if (pageNumber % 100 === 0) {
      config.logger.info(`Downloaded ${pageNumber} pages...`);
    }
  } while (currentPageLink != null);

  return pages;
}

async function loadAll(): Promise<void> {
  config.logger.info(`Loading Azure Pricing Items...`);
  for (const filename of glob.sync('data/az-retail-page-*.json')) {
    try {
      await processFile(filename);
    } catch (e) {
      config.logger.error(`Skipping file ${filename} due to error ${e}`);
      config.logger.error(e.stack);
    }
  }
}

async function processFile(filename: string): Promise<void> {
  config.logger.info(`Processing file ${filename}`);
  const body = fs.readFileSync(filename);
  const json = <ItemsJson>JSON.parse(body.toString());

  const products = Object.values(json.Items).map((productJson) => {
    const product = parseProduct(productJson);
    return product;
  });

  await upsertProducts(products);
}

function parseProduct(productJson: ProductJson): Product {
  let sku = `${productJson.skuId}/${productJson.meterId}`;

  // Use the ARM SKU Name for VMs and App Service Plans so we can group the purchase options
  if (
    productJson.serviceName === 'Virtual Machines' ||
    productJson.serviceName === 'Azure App Service'
  ) {
    sku = `${productJson.productId}/${productJson.armSkuName}/${productJson.meterId}`;
  }

  const product: Product = {
    productHash: '',
    sku,
    vendorName: 'azure',
    region: productJson.armRegionName || null,
    service: productJson.serviceName,
    productFamily: productJson.serviceFamily,
    attributes: {
      effectiveStartDate: productJson.effectiveStartDate,
      productId: productJson.productId,
      productName: productJson.productName,
      serviceId: productJson.serviceId,
      serviceFamily: productJson.serviceFamily,
      skuName: productJson.skuName,
      armSkuName: productJson.armSkuName,
      meterId: productJson.meterId,
      meterName: productJson.meterName,
    },
    prices: [],
  };

  product.productHash = generateProductHash(product);
  product.prices = parsePrices(product, productJson);

  return product;
}

function parsePrices(product: Product, productJson: ProductJson): Price[] {
  const prices: Price[] = [];

  let purchaseOption = productJson.type;
  if (productJson.skuName.endsWith(' Spot')) {
    purchaseOption = 'Spot';
  }

  if (productJson.skuName.endsWith(' Low Priority')) {
    purchaseOption = 'Low Priority';
  }

  const price: Price = {
    priceHash: '',
    purchaseOption,
    unit: productJson.unitOfMeasure,
    USD: `${productJson.unitPrice}`,
    effectiveDateStart: productJson.effectiveStartDate,
    startUsageAmount: productJson.tierMinimumUnits.toString(),
  };

  if (productJson.reservationTerm) {
    price.termLength = reservationTermMapping[productJson.reservationTerm];

    if (!price.termLength) {
      config.logger.warn(
        `Could not map reservation term for value ${productJson.reservationTerm}`
      );
    }
  }

  price.priceHash = generatePriceHash(product, price);

  prices.push(price);

  return prices;
}

export default {
  update,
};
