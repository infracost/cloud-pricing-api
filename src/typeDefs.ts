import { gql } from 'apollo-server-express';

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
    productFamily: String
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
    startUsageAmount: String
    endUsageAmount: String
    termLength: String
    termPurchaseOption: String
    termOfferingClass: String
  }

  type Query {
    products(filter: ProductFilter): [Product]
  }
`;

export default typeDefs;
