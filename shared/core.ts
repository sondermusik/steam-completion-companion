export const PLUGIN_SLUG = 'steam-completion-companion';
export const PLUGIN_TITLE = 'Steam Completion Companion';
export const CSS_PREFIX = 'scc';

export type IpcValue = string | number | boolean | null;
export type IpcParams = Record<string, IpcValue>;

export type CompletionCompanionResponseItem = {
  label?: string;
  value?: string;
  kind?: string;
};

export type CompletionCompanionResponse = {
  ok?: boolean;
  show_panel?: boolean;
  type?: string;
  has_app?: boolean;
  app_id?: number;
  page_kind?: string;
  title?: string;
  summary?: string;
  restricted_count?: number;
  steam_hunters_url?: string;
  items?: CompletionCompanionResponseItem[];
  error?: string;
};

export type IconHtmlResult = {
  html: string;
  className: string;
};