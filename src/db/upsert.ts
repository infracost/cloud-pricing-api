import _ from 'lodash';
import { BulkWriteUpdateOneOperation, BulkWriteOpResultObject } from 'mongodb';
import config from '../config';
import { Product, Price } from './types';

const batchSize = 1000;

async function upsertProducts(products: Product[]): Promise<void> {
  const db = await config.db();

  const promises: Promise<BulkWriteOpResultObject>[] = [];

  let batchUpdates: BulkWriteUpdateOneOperation<Product>[] = [];

  products.forEach((product) => {
    batchUpdates.push({
      updateOne: {
        filter: {
          productHash: product.productHash,
        },
        update: {
          $set: _.omit(product, 'prices'),
          $pull: {
            prices: {
              priceHash: { $in: product.prices.map((p) => p.priceHash) },
            },
          },
        },
        upsert: true,
      },
    });

    batchUpdates.push({
      updateOne: {
        filter: {
          productHash: product.productHash,
        },
        update: {
          $set: _.omit(product, 'prices'),
          $push: { prices: { $each: product.prices } },
        },
        upsert: true,
      },
    });

    if (batchUpdates.length >= batchSize) {
      promises.push(db.collection('products').bulkWrite(batchUpdates));
      batchUpdates = [];
    }
  });

  if (batchUpdates.length > 0) {
    promises.push(db.collection('products').bulkWrite(batchUpdates));
  }
  await Promise.all(promises);
}

async function upsertPrice(product: Product, price: Price): Promise<void> {
  const db = await config.db();

  await db.collection('products').updateOne(
    {
      productHash: product.productHash,
    },
    {
      $pull: {
        prices: {
          priceHash: price.priceHash,
        },
      },
    }
  );

  await db.collection('products').updateOne(
    {
      productHash: product.productHash,
    },
    {
      $push: { prices: price },
    }
  );
}

export { upsertProducts, upsertPrice };
