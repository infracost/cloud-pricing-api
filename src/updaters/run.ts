import yargs from 'yargs';
import config from '../config';
import awsBulk from './awsBulk';
import awsSpot from './awsSpot';
import azureRetail from './azureRetail';
import gcpCatalog from './gcpCatalog';
import gcpMachineTypes from './gcpMachineTypes';
import scaleway from './scaleway';

interface UpdaterConfig {
  vendor: string;
  source: string;
  updaterFunc: () => void;
}

const updaters = {
  scaleway: {
    all: scaleway.update,
  },
  aws: {
    bulk: awsBulk.update,
    spot: awsSpot.update,
  },
  azure: {
    retail: azureRetail.update,
  },
  gcp: {
    catalog: gcpCatalog.update,
    machineTypes: gcpMachineTypes.update,
  },
};

async function run(): Promise<void> {
  const { argv } = yargs
    .usage(
      'Usage: $0 --only=[aws:bulk,aws:spot,azure:retail,gcp:catalog,gcp:machineTypes,scaleway:all]'
    )
    .options({
      only: { type: 'string' },
    });

  const updaterConfigs: UpdaterConfig[] = [];

  Object.entries(updaters).forEach((updaterEntry) => {
    const [vendor, vendorUpdaters] = updaterEntry;
    Object.entries(vendorUpdaters).forEach((vendorUpdaterEntry) => {
      const [source, updaterFunc] = vendorUpdaterEntry;

      if (
        !argv.only ||
        (argv.only && argv.only.split(',').includes(`${vendor}:${source}`))
      ) {
        updaterConfigs.push({
          vendor,
          source,
          updaterFunc,
        });
      }
    });
  });

  for (const updaterConfig of updaterConfigs) {
    config.logger.info(
      `Running update function for ${updaterConfig.vendor}:${updaterConfig.source}`
    );
    await updaterConfig.updaterFunc();
  }
}

export default {
  run,
};
