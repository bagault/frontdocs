export interface MarkdownFile {
  path: string;
  name: string;
  relative_path: string;
}

export interface FileContent {
  path: string;
  name: string;
  content: string;
  frontmatter: string | null;
  body: string | null;
}

export interface FileTreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileTreeNode[];
}

export interface BuildResult {
  success: boolean;
  output_path: string;
  stdout: string;
  stderr: string;
}

export interface AppSettings {
  output_format: 'folder' | 'archive';
  output_path: string | null;
  ai_provider: 'ollama' | 'external';
  ollama_url: string;
  ollama_model: string;
  external_api_url: string;
  external_api_key: string;
  external_model: string;
  theme: string;
  base_url: string;
}

export interface AiConfig {
  provider: string;
  ollama_url: string;
  ollama_model: string;
  external_url: string;
  external_key: string;
  external_model: string;
}

export interface AiResponse {
  content: string;
  model: string;
  provider: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  fileAction?: AiFileAction;
  snapshotId?: string;
  actionStatus?: 'pending' | 'applied' | 'reverted';
}

export interface AiFileAction {
  type: 'create' | 'edit';
  filePath: string;
  fileName: string;
  oldContent?: string;
  newContent: string;
  description: string;
}

export interface Snapshot {
  id: string;
  timestamp: number;
  filePath: string;
  content: string;
  description: string;
}

export type AiAction =
  | 'complete'
  | 'generate_page'
  | 'summarize'
  | 'suggest_structure'
  | 'generate_metadata';
