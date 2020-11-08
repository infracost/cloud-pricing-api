export type ProductAttributes = { [key: string]: string };

export type Product = {
  productHash: string;
  sku: string;
  vendorName: string;
  region: string | null;
  service: string;
  productFamily: string;
  attributes: ProductAttributes;
  prices: Price[];
};

export type Price = {
  priceHash: string;
  purchaseOption: string;
  unit: string;
  USD: string;
  effectiveDateStart: Date;
  effectiveDateEnd?: Date;
  startUsageAmount?: number;
  endUsageAmount?: number;
  termLength?: string;
  termPurchaseOption?: string;
  termOfferingClass?: string;
  description?: string;
};
