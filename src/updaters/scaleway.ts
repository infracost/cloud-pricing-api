import axios from 'axios';
import fs from 'fs';

import { Product, Price } from '../db/types';
import config from '../config';
import { generateProductHash, generatePriceHash } from '../db/helpers';
import { upsertProducts } from '../db/upsert';

const baseUrl = 'https://api.scaleway.com';
const regions = ['fr-par-1', 'fr-par-2', 'nl-ams-1', 'pl-waw-1'];

type ServersJson = {
  servers: {
    [key: string]: {
      monthly_price: number;
      hourly_price: number;
    };
  };
};

async function downloadJson(url: string, path: string) {
  config.logger.info(`Downloading ${url}`);
  const resp = await axios({
    method: 'get',
    url: url,
    responseType: 'stream',
  });
  const writer = fs.createWriteStream(path);
  resp.data.pipe(writer);
  await new Promise((resolve) => {
    writer.on('finish', resolve);
  });
}

async function downloadRegion(region: string) {
  await downloadJson(
    `${baseUrl}/instance/v1/zones/${region}/products/servers`,
    `data/scaleway-${region}-servers.json`
  );
}

async function downloadAll() {
  for (const region of regions) {
    await downloadRegion(region);
  }
}

async function processServersFile(region: string, path: string) {
  const body = fs.readFileSync(path);
  const json = <ServersJson>JSON.parse(body.toString());

  const products = Object.keys(json.servers).map((serverName) => {
    const server = json.servers[serverName];

    const product: Product = {
      productHash: '',
      vendorName: 'scaleway',
      service: 'Compute',
      productFamily: 'Instance',
      region: region,
      sku: `generated-${serverName}`,
      attributes: {
        commercialType: serverName,
      },
      prices: [],
    };

    product.productHash = generateProductHash(product);

    const hourlyPrice: Price = {
      priceHash: '',
      unit: 'hourly',
      USD: server.hourly_price.toString(),
      purchaseOption: '',
      effectiveDateStart: '',
    };

    hourlyPrice.priceHash = generatePriceHash(product, hourlyPrice);

    const monthlyPrice: Price = {
      priceHash: '',
      unit: 'monthly',
      USD: server.monthly_price.toString(),
      purchaseOption: '',
      effectiveDateStart: '',
    };

    monthlyPrice.priceHash = generatePriceHash(product, monthlyPrice);

    product.prices = [hourlyPrice, monthlyPrice];

    return product;
  });

  await upsertProducts(products);
}

async function loadRegion(region: string) {
  const serverFilePath = `data/scaleway-${region}-servers.json`;

  config.logger.info(`Processing file: ${serverFilePath}`);
  try {
    await processServersFile(region, serverFilePath);
  } catch (e) {
    config.logger.error(`Skipping file ${serverFilePath} due to error ${e}`);
    config.logger.error(e.stack);
  }
}

async function loadAll(): Promise<void> {
  for (const region of regions) {
    await loadRegion(region);
  }
}

async function update(): Promise<void> {
  await downloadAll();
  await loadAll();
}

export default {
  update,
};
