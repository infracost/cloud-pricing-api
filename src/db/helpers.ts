import _ from 'lodash';
import crypto from 'crypto';
import { Product, Price } from './types';

function generateProductHash(product: Product): string {
  const hashableValues = _.values(_.pick(product, ['vendorName', 'sku']));
  return crypto
    .createHash('md5')
    .update(hashableValues.join('-'))
    .digest('hex');
}

function generatePriceHash(productHash: string, price: Price): string {
  const hashableValues = _.values(
    _.pick(price, [
      'purchaseOption',
      'unit',
      'termLength',
      'termPurchaseOption',
      'termOfferingClass',
    ])
  );
  const hash = crypto
    .createHash('md5')
    .update(hashableValues.join('-'))
    .digest('hex');
  return `${productHash}-${hash}`;
}

export { generateProductHash, generatePriceHash };
