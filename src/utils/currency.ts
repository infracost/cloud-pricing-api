import axios from 'axios';
import { Mutex } from 'async-mutex';
import config from '../config';

type RateResp = {
  rates: { [code: string]: number };
  base: string;
  date: string;
};

const currencyTTL = 24 * 60 * 60;

const mutex = new Mutex();

const currencyFallbacks: { [from: string]: { [to: string]: number } } = {
  CNY: { USD: 0.154 },
};

async function convert(
  from: string,
  to: string,
  amount: number
): Promise<number> {
  const rate = await getRate(from, to);

  return amount * rate;
}

async function getRate(from: string, to: string): Promise<number> {
  const cacheKey = `currency-${from}-${to}`;

  // Use a mutex so we only query the API once
  const release = await mutex.acquire();

  try {
    let rate = config.cache.get<number>(`currency-${from}-${to}`);
    if (rate !== undefined) {
      return rate;
    }

    rate = await queryRate(from, to);
    if (rate !== undefined) {
      config.logger.debug(
        `Saving ${cacheKey}=${rate} to cache with TTL ${currencyTTL}`
      );
      const ok = config.cache.set(`currency-${from}-${to}`, rate, currencyTTL);
      if (!ok) {
        config.logger.warn('Could not store exchange rate in cache');
      }

      return rate;
    }

    config.logger.warn('No exchange rate found, falling back to default rate');
    return currencyFallbacks[from][to];
  } finally {
    release();
  }
}

async function queryRate(
  from: string,
  to: string
): Promise<number | undefined> {
  const url = `https://api.exchangeratesapi.io/latest?base=${from}&symbols=${to}`;

  try {
    config.logger.debug(`Querying exchange rate from: ${url}`);
    const resp = await axios({
      method: 'get',
      url,
    });

    return (<RateResp>resp.data).rates[to];
  } catch (err) {
    config.logger.error('Error querying exchange rate:');
    config.logger.error(err);
    return undefined;
  }
}

export default {
  convert,
};
