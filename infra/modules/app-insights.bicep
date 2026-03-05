// Application Insights + Log Analytics

param location string
param env string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'vantage-logs-${env}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'vantage-insights-${env}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

output connectionString string = appInsights.properties.ConnectionString
