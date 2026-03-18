// Azure OpenAI

param location string
param env string

resource openai 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: 'vantage-openai-${env}'
  location: location
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    publicNetworkAccess: 'Enabled'
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openai
  name: 'gpt-4.1'
  sku: {
    name: 'Standard'
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1'
      version: '2024-07-18'
    }
  }
}

output endpoint string = openai.properties.endpoint
output key string = openai.listKeys().key1
