import _ from 'lodash';
import { IResolvers } from 'graphql-tools';
import mingo from 'mingo';
import config from './config';
import { Product, Price } from './db/types';

const productLimit = 1000;

type MongoDbFilter = { [attr: string]: { [op: string]: string | RegExp } };

type Filter = { [key: string]: string };

type AttributeFilter = {
  key: string;
  value?: string;
  valueRegex?: string;
};

interface ProductsArgs {
  filter: Filter & {
    attributeFilters: AttributeFilter[];
  };
}

interface PricesArgs {
  filter: Filter;
}

type TransformedProductAttribute = {
  key: string;
  value: string;
};

function strToRegex(str: string): RegExp {
  const pattern = (str.match(/\/(.+)\/.*/) || [''])[1];
  const options = (str.match(/\/.+\/(.*)/) || [undefined])[1];
  return new RegExp(pattern, options);
}

const resolvers: IResolvers = {
  Query: {
    products: async (
      _parent: unknown,
      args: ProductsArgs
    ): Promise<Product[]> => {
      const db = await config.db();

      const productFilter = transformFilter(
        <Filter>_.omit(args.filter, 'attributeFilters')
      );
      const attributeFilters = transformAttributeFilters(
        <AttributeFilter[]>args.filter.attributeFilters
      );

      const products = await db
        .collection('products')
        .find({
          ...productFilter,
          ...attributeFilters,
        })
        .limit(productLimit)
        .toArray();

      return products;
    },
  },
  Product: {
    attributes: async (
      product: Product
    ): Promise<TransformedProductAttribute[]> =>
      Object.entries(product.attributes).map((a) => ({
        key: a[0],
        value: a[1],
      })),
    prices: async (product: Product, args: PricesArgs): Promise<Price[]> => {
      const prices = mingo.find(product.prices, transformFilter(args.filter));
      return prices.all();
    },
  },
};

function transformFilter(filter: Filter): MongoDbFilter {
  const transformed: MongoDbFilter = {};
  if (!filter) {
    return transformed;
  }
  Object.entries(filter).forEach((filterItem) => {
    const keyPart = filterItem[0];
    let value: any = filterItem[1]; // eslint-disable-line @typescript-eslint/no-explicit-any
    let op = '$eq';

    const [key, opPart] = keyPart.split('_');
    if (opPart === 'regex') {
      op = '$regex';
      value = strToRegex(value);
    } else if (value === '') {
      op = '$in';
      value = ['', null];
    }

    transformed[key] = {};
    transformed[key][op] = value;
  });
  return transformed;
}

function transformAttributeFilters(filters: AttributeFilter[]): MongoDbFilter {
  const transformed: MongoDbFilter = {};
  if (!filters) {
    return transformed;
  }
  filters.forEach((filter) => {
    transformed[`attributes.${filter.key}`] = transformFilter(
      <Filter>_.omit(filter, 'key')
    ).value;
  });
  return transformed;
}

export default resolvers;
