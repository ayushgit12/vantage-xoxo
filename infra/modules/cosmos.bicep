// Cosmos DB with MongoDB API

param location string
param env string

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' = {
  name: 'vantage-cosmos-${env}'
  location: location
  kind: 'MongoDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      { locationName: location, failoverPriority: 0 }
    ]
    apiProperties: {
      serverVersion: '4.2'
    }
    capabilities: [
      { name: 'EnableMongo' }
      { name: 'EnableServerless' }
    ]
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases@2024-02-15-preview' = {
  parent: cosmosAccount
  name: 'vantage'
  properties: {
    resource: { id: 'vantage' }
  }
}

output connectionString string = cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
