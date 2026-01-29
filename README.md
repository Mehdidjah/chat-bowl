# Chat Bowl

A modern, feature-rich AI chat interface with multiple free AI providers, inspired by [shadcn/ui](https://ui.shadcn.com).

Developed by **Mehdi**

## Features

### AI Providers (All Free!)
- **Demo AI** - Built-in demo, works immediately
- **Groq** - Ultra-fast Llama 2 Chat (70B), free tier (30 req/min)
- **HuggingFace** - Llama 2 Chat + Stable Diffusion 2.1, free tier
- **Ollama** - Run Llama 2 and other models locally

### Core Features
- **Stable Diffusion 2.1** - AI image generation via HuggingFace (free fallback: Pollinations.ai)
- **Python Code Runner** - Execute code in sandbox
- **Markdown Rendering** - Full markdown with syntax highlighting
- **Light/Dark Theme** - Automatic and manual switching
- **Chat History** - Save, load, and manage conversations
- **Image Support** - Drag & drop images for vision models

### Advanced Features
1. **Voice Input** - Speech-to-text
2. **Text-to-Speech** - Listen to AI responses
3. **Chat Search** - Search through all messages
4. **Bookmarks** - Save important messages
5. **Prompt Templates** - 10 pre-built prompts
6. **Chat Personas** - Different AI personalities
7. **System Presets** - Reusable system prompts
8. **Token Counter** - Estimate token usage
9. **Response Timer** - Track response times
10. **Conversation Summarizer** - Summarize chats
11. **Smart Replies** - AI-powered suggestions
12. **Message Reactions** - React with emojis

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Send message |
| `Ctrl+Shift+I` | Generate image |
| `Ctrl+Shift+R` | Run code |
| `Ctrl+Shift+P` | Change persona |
| `Ctrl+Shift+F` | Search chats |
| `Ctrl+Shift+B` | Bookmarks |
| `Ctrl+L` | Clear chat |
| `Escape` | Close modal |

## Getting Started

### Prerequisites
- Python 3.8+

### Installation

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the server:**
   ```bash
   python app.py
   ```

3. **Open in browser:**
   http://127.0.0.1:5000

### Free AI API Keys

- **Groq (Recommended for Llama 2):** https://console.groq.com/keys
- **HuggingFace (For Llama 2 + Stable Diffusion):** https://huggingface.co/settings/tokens
- **Image Generation Fallback:** No key needed (Pollinations.ai)

### Using with Ollama (Optional)

1. Install from https://ollama.ai
2. Pull a model: `ollama pull llama2`
3. Start: `ollama serve`
4. Select your model in Chat Bowl

## Project Structure

```
Chat-bowl/
├── app.py              # Flask backend with AI providers
├── requirements.txt    # Python dependencies
├── README.md           # Documentation
├── templates/
│   └── index.html      # Main HTML template
└── static/
    ├── main.js         # Core JavaScript
    ├── features.js     # Advanced features
    ├── style.css       # Styles (shadcn/ui inspired)
    ├── jq.min.js       # jQuery
    └── Segoe Fluent Icons.ttf  # Icon font
```

## License

MIT License

## Author

Developed by **Mehdi**
