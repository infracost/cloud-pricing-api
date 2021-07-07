import axios from 'axios';
import fs from 'fs';

import config from '../config';
import { generateProductHash, generatePriceHash } from '../db/helpers';
import { Product, Price } from '../db/types';
import { upsertProducts } from '../db/upsert';

const url = 'https://api.digitalocean.com/v2/sizes';

type Response = {
  sizes: Array<Droplet>,
};

type Droplet = {
  slug: string,
  transfer: number,
  memory: number,
  vcpus: number,
  disk: number,
  // eslint-disable-next-line camelcase
  price_monthly: number,
  // eslint-disable-next-line camelcase
  price_hourly: number,
  regions: Array<string>,
  available: boolean,
  description: string,
};

async function downloadJson() {
  config.logger.info(`Downloading ${url}`);
  const response = await axios({
    method: 'get',
    url,
    responseType: 'stream',
    headers: {
      Authorization: `Bearer ${config.digitalOceanToken}`,
    },
    params: {
      // eslint-disable-next-line camelcase
      per_page: 250
    }
  });
  const writer = fs.createWriteStream('data/digitalocean-droplets.json');
  response.data.pipe(writer);
  await new Promise(resolve => writer.on('finish', resolve));
}

function generateProduct(droplet: Droplet): Product {
  return {
    productHash: '',
    vendorName: 'digitalocean',
    service: 'Droplets',
    productFamily: droplet.description,
    region: '',
    sku: droplet.slug,
    attributes: {
      transfer: droplet.transfer.toString(),
      vcpus: droplet.vcpus.toString(),
      memory: droplet.memory.toString(),
      disk: droplet.disk.toString(),
    },
    prices: [],
  };
}

function generatePrice(unit: 'hourly' | 'monthly', droplet: Droplet, product: Product): Price {
  const cost = unit === 'hourly' ? droplet.price_hourly : droplet.price_monthly;
  const price = {
    priceHash: '',
    unit,
    USD: cost.toString(),
    purchaseOption: '',
    effectiveDateStart: '',
  };
  price.priceHash = generatePriceHash(product, price);
  return price;
}

async function processDroplets() {
  const body = fs.readFileSync('data/digitalocean-droplets.json');
  const json = <Response>JSON.parse(body.toString());

  const products = json.sizes.flatMap(droplet => {
    return droplet.regions.map(region => {
      const product = generateProduct(droplet);

      product.region = region;
      product.productHash = generateProductHash(product);
      product.prices = [
        generatePrice('hourly', droplet, product),
        generatePrice('monthly', droplet, product),
      ];

      return product;
    });
  });

  config.logger.info(`Added ${products.length} products`);
  await upsertProducts(products);
}

async function update(): Promise<void> {
  await downloadJson();
  await processDroplets();
}

export default {
  update,
};
