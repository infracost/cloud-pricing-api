import _ from 'lodash';
import axios from 'axios';
import config from '../config';
import { Product, Price } from '../db/types';
import { generatePriceHash } from '../db/helpers';

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

        const product = await findProduct(
          region,
          instanceType,
          operatingSystem
        );
        if (!product) {
          config.logger.warn(
            `SKIPPING: could not find an existing product for ${region}, ${instanceType}, ${operatingSystem}`
          );
          continue;
        }

        const existingSpotPrice = product.prices.find(
          (p) => p.purchaseOption === 'spot'
        );
        if (existingSpotPrice) {
          if (existingSpotPrice.USD === usd) {
            continue;
          }
          existingSpotPrice.effectiveDateStart = now;
          existingSpotPrice.USD = usd;
          await updateProduct(product);
          continue;
        }

        const existingOnDemandPrice = product.prices.find(
          (p) => p.purchaseOption === 'on_demand'
        );
        if (existingOnDemandPrice) {
          const newSpotPrice: Price = {
            ...existingOnDemandPrice,
            purchaseOption: 'spot',
            USD: usd,
            effectiveDateStart: now,
          };

          newSpotPrice.priceHash = generatePriceHash(
            product.productHash,
            newSpotPrice
          );

          product.prices.push(newSpotPrice);
          await updateProduct(product);
          continue;
        }
      }
    }
  }
}

async function findProduct(
  region: string,
  instanceType: string,
  operatingSystem: string
): Promise<Product | null> {
  const db = await config.db();

  return db.collection('products').findOne({
    vendorName: 'aws',
    service: 'AmazonEC2',
    productFamily: {
      $in: ['Compute Instance', 'Compute Instance (bare metal)'],
    },
    region,
    'attributes.instanceType': instanceType,
    'attributes.operatingSystem': operatingSystem,
    'attributes.tenancy': { $in: ['Shared', 'Host'] },
    'attributes.capacitystatus': 'Used',
    'attributes.preInstalledSw': 'NA',
  });
}

async function updateProduct(product: Product) {
  const db = await config.db();

  return db.collection('products').updateOne(
    {
      vendorName: 'aws',
      sku: product.sku,
    },
    { $set: product }
  );
}

export default {
  update,
};
