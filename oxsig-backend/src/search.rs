// Search service using MeiliSearch
use meilisearch_sdk::{client::Client, indexes::IndexesQuery};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchableDocument {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub user_id: String,
    pub status: String,
    pub created_at: i64,
}

pub struct SearchService {
    client: Client,
    index_name: String,
}

impl SearchService {
    pub async fn new(url: &str, api_key: &str) -> Result<Self, anyhow::Error> {
        let client = Client::new(url, Some(api_key))?;
        let index_name = "documents".to_string();

        // Create index if it doesn't exist
        let service = Self { client, index_name: index_name.clone() };
        service.ensure_index().await?;

        Ok(service)
    }

    async fn ensure_index(&self) -> Result<(), anyhow::Error> {
        let index = self.client.index(&self.index_name);
        
        // Try to get the index, create if it doesn't exist
        match index.get_stats().await {
            Ok(_) => Ok(()),
            Err(_) => {
                self.client.create_index(&self.index_name, Some("id")).await?;
                
                // Configure searchable attributes
                index.set_searchable_attributes(&["title", "description"]).await?;
                
                // Configure filterable attributes
                index.set_filterable_attributes(&["user_id", "status", "created_at"]).await?;
                
                Ok(())
            }
        }
    }

    pub async fn index_document(&self, doc: SearchableDocument) -> Result<(), anyhow::Error> {
        let index = self.client.index(&self.index_name);
        index.add_documents(&[doc], Some("id")).await?;
        Ok(())
    }

    pub async fn search(
        &self,
        query: &str,
        user_id: Option<Uuid>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<SearchableDocument>, anyhow::Error> {
        let index = self.client.index(&self.index_name);
        
        let mut search = index.search();
        search.with_query(query);
        search.with_limit(limit);
        search.with_offset(offset);
        
        if let Some(uid) = user_id {
            search.with_filter(&format!("user_id = '{}'", uid));
        }

        let results = search.execute::<SearchableDocument>().await?;
        Ok(results.hits.into_iter().map(|hit| hit.result).collect())
    }

    pub async fn delete_document(&self, id: &str) -> Result<(), anyhow::Error> {
        let index = self.client.index(&self.index_name);
        index.delete_document(id).await?;
        Ok(())
    }
}
