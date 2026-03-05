// Vantage — Azure Infrastructure (Bicep)
// Deploy: az deployment group create --resource-group vantage-rg --template-file main.bicep

targetScope = 'resourceGroup'

@description('Azure region')
param location string = resourceGroup().location

@description('Environment name')
param env string = 'dev'

// ─── Cosmos DB (MongoDB API) ───
module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos-${env}'
  params: {
    location: location
    env: env
  }
}

// ─── Storage Account ───
module storage 'modules/storage.bicep' = {
  name: 'storage-${env}'
  params: {
    location: location
    env: env
  }
}

// ─── Service Bus ───
module serviceBus 'modules/service-bus.bicep' = {
  name: 'servicebus-${env}'
  params: {
    location: location
    env: env
  }
}

// ─── Application Insights ───
module appInsights 'modules/app-insights.bicep' = {
  name: 'appinsights-${env}'
  params: {
    location: location
    env: env
  }
}

// ─── Azure OpenAI ───
module openai 'modules/openai.bicep' = {
  name: 'openai-${env}'
  params: {
    location: location
    env: env
  }
}

// ─── Container Apps ───
module containerApps 'modules/container-apps.bicep' = {
  name: 'containers-${env}'
  params: {
    location: location
    env: env
    cosmosConnectionString: cosmos.outputs.connectionString
    storageConnectionString: storage.outputs.connectionString
    serviceBusConnectionString: serviceBus.outputs.connectionString
    appInsightsConnectionString: appInsights.outputs.connectionString
    openaiEndpoint: openai.outputs.endpoint
    openaiKey: openai.outputs.key
  }
}

// ─── Outputs ───
output apiUrl string = containerApps.outputs.apiUrl
output frontendUrl string = containerApps.outputs.frontendUrl
