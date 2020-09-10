const _ = require('lodash');
const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const pinoHttp = require('pino-http');
const { MongoClient } = require('mongodb');
const mingo = require('mingo');
const config = require('./config');
const apolloLogger = require('./utils/apolloLogger');

const productLimit = 1000;
const defaultOperation = '$eq';
const operationMapping = {
  regex: '$regex',
};

const strToRegex = (str) => {
  const main = str.match(/\/(.+)\/.*/)[1];
  const options = str.match(/\/.+\/(.*)/)[1];
  return new RegExp(main, options);
};

const typeDefs = gql`
  type Price {
    priceHash: String!
    purchaseOption: String
    unit: String!
    USD: String!
    effectiveDateStart: String
    effectiveDateEnd: String
    startUsageAmount: String
    endUsageAmount: String
    description: String
    termLength: String
    termPurchaseOption: String
    termOfferingClass: String
  }

  type Product {
    productHash: String!
    vendorName: String!
    service: String!
    productFamily: String!
    region: String
    sku: String!
    attributes: [Attribute]
    prices(filter: PriceFilter): [Price]
  }

  type Attribute {
    key: String!
    value: String
  }

  input AttributeFilter {
    key: String!
    value: String
    value_regex: String
  }

  input ProductFilter {
    vendorName: String
    service: String
    productFamily: String
    region: String
    sku: String
    attributeFilters: [AttributeFilter]
  }
  
  input PriceFilter {
    purchaseOption: String
    unit: String
    description: String
    description_regex: String
    termLength: String
    termPurchaseOption: String
    termOfferingClass: String
  }

  type Query {
    products(filter: ProductFilter): [Product]
  }
`;

function transformProduct(product) {
  return {
    ..._.omit(product, 'attributes'),
    attributes: Object.entries(product.attributes).map(
      (f) => ({ key: f[0], value: f[1] }),
    ),
  };
}

function transformFilter(filter) {
  const transformed = {};
  if (!filter) {
    return transformed;
  }
  Object.entries(filter).forEach((filterItem) => {
    const keyPart = filterItem[0];
    let value = filterItem[1];
    const [key, operation] = keyPart.split('_');
    if (operation === 'regex') {
      value = strToRegex(value);
    }
    const transformedOperation = operationMapping[operation] || defaultOperation;
    transformed[key] = {};
    transformed[key][transformedOperation] = value;
  });
  return transformed;
}

function transformAttributeFilters(filters) {
  const transformed = {};
  if (!filters) {
    return transformed;
  }
  filters.forEach((filter) => {
    transformed[`attributes.${filter.key}`] = transformFilter(_.omit(filter, 'key')).value;
  });
  return transformed;
}

const resolvers = {
  Query: {
    products: async (_parent, args) => {
      const mongoClient = await MongoClient.connect(config.mongoDbUri, { useUnifiedTopology: true });
      const db = mongoClient.db();

      const products = await db.collection('products').find({
        ...transformFilter(_.omit(args.filter, 'attributeFilters')),
        ...transformAttributeFilters(args.filter.attributeFilters),
      }).limit(productLimit).toArray();

      mongoClient.close();

      return products.map((p) => transformProduct(p));
    },
  },
  Product: {
    prices: async (product, args) => {
      const prices = mingo.find(product.prices, transformFilter(args.filter));
      return prices;
    },
  },
};

const app = express();

app.use(pinoHttp({
  logger: config.logger,
}));

const server = new ApolloServer({
  typeDefs,
  resolvers,
  engine: {
    sendHeaders: { all: true},
  },
  context: (ctx) => {
    return { ip: ctx.req.ip }
  },
  introspection: true,
  playground: true,
  plugins: [
    apolloLogger,
  ],
});

server.applyMiddleware({ app });

app.listen(config.port, '0.0.0.0', () => {
  config.logger.info(`🚀  Server ready at http://0.0.0.0:${config.port}/`);
});
