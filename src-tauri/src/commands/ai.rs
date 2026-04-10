use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConfig {
    pub provider: String, // "ollama" or "external"
    pub ollama_url: String,
    pub ollama_model: String,
    pub external_url: String,
    pub external_key: String,
    pub external_model: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiResponse {
    pub content: String,
    pub model: String,
    pub provider: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaListResponse {
    models: Vec<OllamaModelInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaModelInfo {
    name: String,
    size: u64,
    modified_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaChatResponse {
    message: OllamaMessage,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExternalChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExternalChatResponse {
    choices: Vec<ExternalChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExternalChoice {
    message: OllamaMessage,
}

async fn call_ai(config: &AiConfig, system_prompt: &str, user_prompt: &str) -> Result<AiResponse, String> {
    let client = reqwest::Client::new();
    let messages = vec![
        OllamaMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        },
        OllamaMessage {
            role: "user".to_string(),
            content: user_prompt.to_string(),
        },
    ];

    match config.provider.as_str() {
        "ollama" => {
            let request = OllamaChatRequest {
                model: config.ollama_model.clone(),
                messages,
                stream: false,
            };

            let url = format!("{}/api/chat", config.ollama_url.trim_end_matches('/'));
            let response = client
                .post(&url)
                .json(&request)
                .send()
                .await
                .map_err(|e| format!("Ollama request failed: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(format!("Ollama returned {}: {}", status, body));
            }

            let chat_response: OllamaChatResponse = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

            Ok(AiResponse {
                content: chat_response.message.content,
                model: config.ollama_model.clone(),
                provider: "ollama".to_string(),
            })
        }
        "external" => {
            let request = ExternalChatRequest {
                model: config.external_model.clone(),
                messages,
                temperature: 0.7,
                max_tokens: 4096,
            };

            let url = format!(
                "{}/chat/completions",
                config.external_url.trim_end_matches('/')
            );
            let response = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", config.external_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await
                .map_err(|e| format!("API request failed: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(format!("API returned {}: {}", status, body));
            }

            let chat_response: ExternalChatResponse = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse API response: {}", e))?;

            let content = chat_response
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .unwrap_or_default();

            Ok(AiResponse {
                content,
                model: config.external_model.clone(),
                provider: "external".to_string(),
            })
        }
        _ => Err(format!("Unknown AI provider: {}", config.provider)),
    }
}

#[tauri::command]
pub async fn ai_complete(config: AiConfig, prompt: String, context: Option<String>) -> Result<AiResponse, String> {
    let system = "You are an expert academic writing assistant integrated into Frontdocs, a knowledge base tool. \
                  You help write, edit, and improve academic documentation in Markdown format. \
                  Always output valid Markdown. Be precise, thorough, and scholarly in tone.";

    let user_prompt = if let Some(ctx) = context {
        format!("Context:\n{}\n\nRequest:\n{}", ctx, prompt)
    } else {
        prompt
    };

    call_ai(&config, system, &user_prompt).await
}

#[tauri::command]
pub async fn ai_generate_page(config: AiConfig, topic: String, context: Option<String>) -> Result<AiResponse, String> {
    let system = "You are an expert academic documentation writer. Generate a well-structured Markdown page \
                  suitable for a knowledge base. Include:\n\
                  - TOML frontmatter with title, date, description, and tags\n\
                  - Clear headings and sections\n\
                  - Academic and professional tone\n\
                  - Proper citations where relevant (use {% cite(key=\"ref_key\") %} shortcode)\n\
                  - LaTeX math notation where appropriate (using $...$ for inline, $$...$$ for display)\n\
                  Output ONLY the complete Markdown document, nothing else.";

    let user_prompt = if let Some(ctx) = context {
        format!(
            "Generate a comprehensive knowledge base page about: {}\n\nAdditional context:\n{}",
            topic, ctx
        )
    } else {
        format!("Generate a comprehensive knowledge base page about: {}", topic)
    };

    call_ai(&config, system, &user_prompt).await
}

#[tauri::command]
pub async fn ai_summarize(config: AiConfig, content: String) -> Result<AiResponse, String> {
    let system = "You are an academic summarization assistant. Produce concise, accurate summaries \
                  that preserve key findings, methodology, and conclusions. Output in Markdown format. \
                  Include a brief abstract, key points as a bulleted list, and a conclusion.";

    let user_prompt = format!("Summarize the following academic content:\n\n{}", content);
    call_ai(&config, system, &user_prompt).await
}

#[tauri::command]
pub async fn ai_suggest_structure(
    config: AiConfig,
    documents: Vec<String>,
) -> Result<AiResponse, String> {
    let system = "You are an information architect specializing in academic knowledge bases. \
                  Given a list of document titles and summaries, suggest an optimal navigation structure. \
                  Output as a Markdown document with:\n\
                  - Proposed category hierarchy\n\
                  - Suggested page ordering within each category\n\
                  - Cross-reference recommendations\n\
                  - Navigation improvements";

    let docs_list = documents
        .iter()
        .enumerate()
        .map(|(i, d)| format!("{}. {}", i + 1, d))
        .collect::<Vec<_>>()
        .join("\n");

    let user_prompt = format!(
        "Suggest a navigation structure for these knowledge base documents:\n\n{}",
        docs_list
    );

    call_ai(&config, system, &user_prompt).await
}

#[tauri::command]
pub async fn ai_generate_metadata(config: AiConfig, content: String) -> Result<AiResponse, String> {
    let system = "You are a metadata specialist for academic documentation. \
                  Generate TOML frontmatter for the given Markdown content. Include:\n\
                  - title: descriptive, concise title\n\
                  - date: today's date (YYYY-MM-DD)\n\
                  - description: 1-2 sentence summary\n\
                  - [taxonomies] with tags: relevant academic keywords\n\
                  - [extra] with abstract: brief academic abstract\n\
                  Output ONLY the TOML frontmatter block (between +++ delimiters), nothing else.";

    let user_prompt = format!(
        "Generate TOML frontmatter metadata for this content:\n\n{}",
        content
    );

    call_ai(&config, system, &user_prompt).await
}

#[tauri::command]
pub async fn list_ollama_models(ollama_url: String) -> Result<Vec<OllamaModel>, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/tags", ollama_url.trim_end_matches('/'));

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Cannot connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama returned status: {}", response.status()));
    }

    let list: OllamaListResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama models: {}", e))?;

    Ok(list
        .models
        .into_iter()
        .map(|m| OllamaModel {
            name: m.name,
            size: m.size,
            modified_at: m.modified_at,
        })
        .collect())
}

#[tauri::command]
pub async fn check_ollama_status(ollama_url: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/tags", ollama_url.trim_end_matches('/'));

    match client.get(&url).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}
