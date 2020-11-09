import _ from 'lodash';
import axios from 'axios';
import config from '../config';
import { Product } from '../db/types';
import { generatePriceHash } from '../db/helpers';
import { upsertPrice } from '../db/upsert';

const ec2Url = 'https://website.spot.ec2.aws.a2z.com/spot.js';

const operatingSystemMapping: { [key: string]: string } = {
  linux: 'Linux',
  mswin: 'Windows',
};

const regionMapping: { [key: string]: string } = {
  'us-east': 'us-east-1',
  'us-west': 'us-west-1',
  'eu-ireland': 'eu-west-1',
  'apac-sin': 'ap-southeast-1',
  'apac-syd': 'ap-southeast-2',
  'apac-tokyo': 'ap-northeast-1',
  'us-west-2-lax-1a': 'us-west-2-lax-1',
};

type SpotJson = {
  config: {
    regions: Array<{
      region: string;
      instanceTypes: Array<{
        sizes: Array<{
          size: string;
          valueColumns: Array<{
            name: string;
            prices: {
              USD: string;
            };
          }>;
        }>;
      }>;
    }>;
  };
};

async function update(): Promise<void> {
  const jsonData = await downloadEc2();
  await loadEc2(jsonData);
}

async function downloadEc2(): Promise<SpotJson> {
  config.logger.info(`Downloading ${ec2Url}`);
  const resp = await axios({
    method: 'get',
    url: ec2Url,
  });
  return <SpotJson>(
    JSON.parse(resp.data.replace(/^callback\(/, '').replace(/\);$/, ''))
  );
}

async function loadEc2(jsonData: SpotJson) {
  config.logger.info('Loading data');
  const now = new Date();

  for (const regionData of jsonData.config.regions) {
    const region = regionMapping[regionData.region] || regionData.region;

    for (const sizeData of _.flatten(
      _.map(regionData.instanceTypes, 'sizes')
    )) {
      const instanceType = sizeData.size;

      for (const valueData of sizeData.valueColumns) {
        const operatingSystem = operatingSystemMapping[valueData.name];
        const usd = valueData.prices.USD;
        if (usd === 'N/A*') {
          continue;
        }

        const products = await findProducts(
          region,
          instanceType,
          operatingSystem
        );
        if (products.length === 0) {
          config.logger.warn(
            `SKIPPING: could not find an existing products for ${region}, ${instanceType}, ${operatingSystem}`
          );
          return;
        }

        for (const product of products) {
          await updateProduct(product, usd, now);
        }
      }
    }
  }
}

async function updateProduct(
  product: Product,
  usd: string,
  effectiveDateStart: Date
): Promise<void> {
  let price = product.prices.find((p) => p.purchaseOption === 'spot');

  // No changes
  if (price && price.USD === usd) {
    return;
  }

  if (!price) {
    const onDemandPrice = product.prices.find(
      (p) => p.purchaseOption === 'on_demand'
    );
    if (onDemandPrice) {
      price = {
        ...onDemandPrice,
        purchaseOption: 'spot',
      };
    }
  }

  if (!price) {
    config.logger.warn(
      `SKIPPING: could not find an existing on-demand price for product hash ${product.productHash}`
    );
    return;
  }

  price.description = '';
  price.effectiveDateStart = effectiveDateStart.toString();
  price.USD = usd;

  price.priceHash = generatePriceHash(product, price);

  await upsertPrice(product, price);
}

async function findProducts(
  region: string,
  instanceType: string,
  operatingSystem: string
): Promise<Product[]> {
  const db = await config.db();

  return db
    .collection('products')
    .find<Product>({
      vendorName: 'aws',
      service: 'AmazonEC2',
      productFamily: {
        $in: ['Compute Instance', 'Compute Instance (bare metal)'],
      },
      region,
      'attributes.instanceType': instanceType,
      'attributes.operatingSystem': operatingSystem,
      'attributes.capacitystatus': 'Used',
      'attributes.preInstalledSw': 'NA',
    })
    .toArray();
}

export default {
  update,
};
