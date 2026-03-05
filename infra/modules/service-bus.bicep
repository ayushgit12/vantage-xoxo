// Azure Service Bus

param location string
param env string

resource namespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: 'vantage-bus-${env}'
  location: location
  sku: { name: 'Basic', tier: 'Basic' }
}

resource retrieverQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: namespace
  name: 'retriever-jobs'
}

resource plannerQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: namespace
  name: 'planner-jobs'
}

resource executorQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: namespace
  name: 'executor-jobs'
}

output connectionString string = listKeys('${namespace.id}/AuthorizationRules/RootManageSharedAccessKey', namespace.apiVersion).primaryConnectionString
