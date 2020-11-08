/* eslint no-shadow: ["error", { "allow": ["requestContext"] }] */

import _ from 'lodash';
import prettier from 'prettier';
import {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from 'apollo-server-plugin-base';
import { Logger } from 'pino';

const DEFAULT_TRUNCATE_LENGTH = 4096;

function truncate(str: string, l = DEFAULT_TRUNCATE_LENGTH): string {
  if (str.length <= l) {
    return str;
  }
  return `${str.slice(0, l)}...`;
}

export default class ApolloLogger implements ApolloServerPlugin {
  constructor(private logger: Logger) {}

  requestDidStart(
    requestContext: GraphQLRequestContext
  ): GraphQLRequestListener {
    const { logger } = this;

    if (requestContext.request.query?.startsWith('query IntrospectionQuery')) {
      return {};
    }

    const ctx = _.omit(requestContext.context, '_extensionStack');

    const query = truncate(
      prettier.format(requestContext.request.query || '', { parser: 'graphql' })
    );
    const vars = truncate(
      JSON.stringify(requestContext.request.variables || {}, null, 2)
    );
    logger.debug(
      ctx,
      `GraphQL request started:\n${query}\nvariables:\n${vars}`
    );

    return {
      didEncounterErrors(requestContext: GraphQLRequestContext) {
        const errors = truncate(JSON.stringify(requestContext.errors));
        logger.error(ctx, `GraphQL encountered errors:\n${errors}`);
      },
      willSendResponse(requestContext: GraphQLRequestContext) {
        const respData = truncate(
          JSON.stringify(requestContext.response?.data)
        );
        logger.debug(ctx, `GraphQL request completed:\n${respData}`);
      },
    };
  }
}
