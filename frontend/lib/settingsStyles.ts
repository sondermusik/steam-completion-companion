/**
 * CSS for the plugin settings page.
 * Kept separate so frontend/index.tsx only handles plugin registration.
 */
export const SETTINGS_CSS = `
  .DialogToggleField_Control {
    width: 42px;
    height: 22px;
    border-radius: 999px;
    position: relative;
    cursor: pointer;
    background: rgba(255,255,255,0.22);
    transition: background 120ms ease;
  }

  .DialogToggleField_Control.On {
    background: linear-gradient(90deg, #06bfff 0%, #2d73ff 100%);
  }

  .DialogToggleField_Option {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: #fff;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 120ms ease;
  }

  .DialogToggleField_Control.On .DialogToggleField_Option {
    transform: translateX(20px);
  }

  .scc-settings-header {
    margin: 16px 0 8px;
    padding: 0 0 6px 6px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .scc-settings-header-secondary {
    margin-top: 24px;
    margin-bottom: 4px;
    padding-bottom: 3px;
  }

  .scc-settings-select,
  .scc-settings-input {
    min-width: 160px;
    height: 28px;
    padding: 0 8px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.16);
    color: #dfe3e6;
    background: rgba(0,0,0,0.25);
  }

  .scc-settings-input {
    width: 80px;
    min-width: 80px;
  }
`;