// Azure Container Apps — all services

param location string
param env string
param cosmosConnectionString string
param storageConnectionString string
param serviceBusConnectionString string
param appInsightsConnectionString string
param openaiEndpoint string
@secure()
param openaiKey string

// Container Apps Environment
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'vantage-env-${env}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
  }
}

// ACR (assumed to exist; reference by name)
var acrServer = 'vantageacr${env}.azurecr.io'

// ─── API Container ───
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'vantage-api-${env}'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acrServer}/vantage-backend:latest'
          command: ['uvicorn', 'api.main:app', '--host', '0.0.0.0', '--port', '8000']
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'COSMOS_CONNECTION_STRING', value: cosmosConnectionString }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', value: storageConnectionString }
            { name: 'SERVICE_BUS_CONNECTION_STRING', value: serviceBusConnectionString }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openaiEndpoint }
            { name: 'AZURE_OPENAI_API_KEY', secretRef: 'openai-key' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// ─── Retriever Worker ───
resource retrieverApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'vantage-retriever-${env}'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    template: {
      containers: [
        {
          name: 'retriever'
          image: '${acrServer}/vantage-backend:latest'
          command: ['python', '-m', 'agents.retriever.worker']
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'COSMOS_CONNECTION_STRING', value: cosmosConnectionString }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', value: storageConnectionString }
            { name: 'SERVICE_BUS_CONNECTION_STRING', value: serviceBusConnectionString }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openaiEndpoint }
            { name: 'AZURE_OPENAI_API_KEY', secretRef: 'openai-key' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 2 }
    }
  }
}

// ─── Planner Worker ───
resource plannerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'vantage-planner-${env}'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    template: {
      containers: [
        {
          name: 'planner'
          image: '${acrServer}/vantage-backend:latest'
          command: ['python', '-m', 'agents.planner.worker']
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'COSMOS_CONNECTION_STRING', value: cosmosConnectionString }
            { name: 'SERVICE_BUS_CONNECTION_STRING', value: serviceBusConnectionString }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 2 }
    }
  }
}

// ─── Executor Worker ───
resource executorApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'vantage-executor-${env}'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    template: {
      containers: [
        {
          name: 'executor'
          image: '${acrServer}/vantage-backend:latest'
          command: ['python', '-m', 'agents.executor.worker']
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'COSMOS_CONNECTION_STRING', value: cosmosConnectionString }
            { name: 'SERVICE_BUS_CONNECTION_STRING', value: serviceBusConnectionString }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'USE_MOCK_CALENDAR', value: 'true' }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}

// ─── Frontend ───
resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'vantage-frontend-${env}'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
      }
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${acrServer}/vantage-frontend:latest'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'NEXT_PUBLIC_API_URL', value: 'https://${apiApp.properties.configuration.ingress.fqdn}' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}

output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
