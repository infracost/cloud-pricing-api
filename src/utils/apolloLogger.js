/* eslint no-shadow: ["error", { "allow": ["requestContext"] }] */

const config = require('../config.js');
const prettier = require('prettier');

module.exports = {
  requestDidStart(requestContext) {
    if (requestContext.request.query.startsWith('query IntrospectionQuery')) {
      return {};
    }

    const ctx = {
      userAgent: requestContext.request.http.headers.get('user-agent'),
      ip: requestContext.context.ip,
    }

    config.logger.debug(ctx, `GraphQL request started:\n${prettier.format(requestContext.request.query, { parser: "graphql"})}\nvariables:\n${JSON.stringify(requestContext.request.variables, null, 2)}`);

    return {
      didEncounterErrors(requestContext) {
        config.logger.error(ctx, `GraphQL encountered errors:\n${JSON.stringify(requestContext.errors)}`);
      },
      willSendResponse(requestContext) {
        config.logger.debug(ctx, `GraphQL request completed:\n${JSON.stringify(requestContext.response.data, null, 2)}`);
      },
    };
  },
};
