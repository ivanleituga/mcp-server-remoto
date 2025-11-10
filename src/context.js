const { AsyncLocalStorage } = require("async_hooks");

const requestContext = new AsyncLocalStorage();

function getAccessToken() {
  return requestContext.getStore()?.accessToken || null;
}

module.exports = { requestContext, getAccessToken };