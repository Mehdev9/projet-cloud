const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

async function getSecret(vaultUrl, secretName) {
  if (!vaultUrl || !secretName) {
    return null;
  }

  const credential = new DefaultAzureCredential();
  const client = new SecretClient(vaultUrl, credential);
  const secret = await client.getSecret(secretName);
  return secret.value;
}

module.exports = {
  getSecret
};
