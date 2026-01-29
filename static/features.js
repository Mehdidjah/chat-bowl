const AIProviders = {
    current: 'demo',
    apiKeys: {},
    models: {
        groq: ['llama2-70b-4096', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
        huggingface: ['meta-llama/Llama-2-7b-chat-hf', 'meta-llama/Llama-2-13b-chat-hf']
    },

    init() {
        const saved = localStorage.getItem('chat-bowl-api-keys');
        if (saved) {
            this.apiKeys = JSON.parse(saved);
        }
        this.current = localStorage.getItem('chat-bowl-provider') || 'demo';
    },

    setProvider(provider) {
        this.current = provider;
        localStorage.setItem('chat-bowl-provider', provider);
        this.updateUI();
    },

    setApiKey(provider, key) {
        this.apiKeys[provider] = key;
        localStorage.setItem('chat-bowl-api-keys', JSON.stringify(this.apiKeys));
    },

    getApiKey(provider) {
        return this.apiKeys[provider] || '';
    },

    updateUI() {
        $('#currentProvider').text(this.current.toUpperCase());
    },

    openSettings() {
        this.renderSettings();
        $('#providerModal').addClass('show');
    },

    closeSettings() {
        $('#providerModal').removeClass('show');
    },

    renderSettings() {
        const $container = $('#providerSettings');
        $container.html(`
            <div class="provider-option ${this.current === 'demo' ? 'active' : ''}" data-provider="demo">
                <div class="provider-header">
                    <strong>Demo AI</strong>
                    <span class="provider-badge free">Free</span>
                </div>
                <p>Built-in demo for testing. No API key needed.</p>
            </div>
            
            <div class="provider-option ${this.current === 'groq' ? 'active' : ''}" data-provider="groq">
                <div class="provider-header">
                    <strong>Groq - Llama 2 Chat</strong>
                    <span class="provider-badge free">Free Tier</span>
                </div>
                <p>Ultra-fast Llama 2 (70B) inference. Free: 30 req/min</p>
                <input type="password" class="api-key-input" placeholder="Enter Groq API key" 
                    value="${this.getApiKey('groq')}" data-provider="groq">
                <a href="https://console.groq.com/keys" target="_blank" class="api-link">Get free API key</a>
            </div>
            
            <div class="provider-option ${this.current === 'huggingface' ? 'active' : ''}" data-provider="huggingface">
                <div class="provider-header">
                    <strong>HuggingFace - Llama 2 Chat + Stable Diffusion</strong>
                    <span class="provider-badge free">Free Tier</span>
                </div>
                <p>Llama 2 Chat for text + Stable Diffusion 2.1 for images</p>
                <input type="password" class="api-key-input" placeholder="Enter HuggingFace token" 
                    value="${this.getApiKey('huggingface')}" data-provider="huggingface">
                <a href="https://huggingface.co/settings/tokens" target="_blank" class="api-link">Get free token (enables Stable Diffusion!)</a>
            </div>
            
            <div class="provider-option ${this.current === 'ollama' ? 'active' : ''}" data-provider="ollama">
                <div class="provider-header">
                    <strong>Ollama (Local)</strong>
                    <span class="provider-badge local">Local</span>
                </div>
                <p>Run Llama 2 and other models locally. Requires Ollama installed.</p>
            </div>
        `);

        $('.provider-option').click(function() {
            const provider = $(this).data('provider');
            $('.provider-option').removeClass('active');
            $(this).addClass('active');
            AIProviders.setProvider(provider);
        });

        $('.api-key-input').on('change', function() {
            const provider = $(this).data('provider');
            AIProviders.setApiKey(provider, $(this).val());
        });
    }
};

const ImageGenerator = {
    history: [],
    lastImageData: null,

    open() {
        this.renderHistory();
        this.updateApiStatus();
        $('#imageModal').addClass('show');
        $('#imagePrompt').focus();
    },

    close() {
        $('#imageModal').removeClass('show');
    },

    updateApiStatus() {
        const hasKey = AIProviders.getApiKey('huggingface');
        const statusEl = $('#sdApiStatus');
        if (hasKey) {
            statusEl.html('<span class="status-badge success">Stable Diffusion 2.1 Ready</span>');
        } else {
            statusEl.html('<span class="status-badge warning">Add HuggingFace API key in Provider Settings for Stable Diffusion</span>');
        }
    },

    async generate() {
        const prompt = $('#imagePrompt').val().trim();
        if (!prompt) return;

        const apiKey = AIProviders.getApiKey('huggingface');
        const modelInfo = apiKey ? 'Stable Diffusion 2.1' : 'Pollinations (fallback)';
        
        $('#imageResult').html(`
            <div class="generating">
                <div class="spinner"></div>
                <p>Generating with ${modelInfo}...</p>
                <p class="generating-hint">This may take 10-30 seconds</p>
            </div>
        `);
        $('#generateImageBtn').prop('disabled', true);

        try {
            const response = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, api_key: apiKey })
            });

            const data = await response.json();
            
            if (data.success) {
                let imageUrl;
                if (data.image_base64) {
                    imageUrl = `data:image/png;base64,${data.image_base64}`;
                    this.lastImageData = data.image_base64;
                } else {
                    imageUrl = data.image_url;
                    this.lastImageData = null;
                }
                
                this.history.unshift({ prompt, url: imageUrl, model: data.model, time: Date.now() });
                this.saveHistory();
                
                $('#imageResult').html(`
                    <div class="generated-image">
                        <img src="${imageUrl}" alt="${prompt}" onload="this.parentElement.classList.add('loaded')">
                        <div class="image-model-badge">${data.model}</div>
                        <div class="image-actions">
                            <button onclick="ImageGenerator.insertToChat()" class="button">Insert to Chat</button>
                            <button onclick="ImageGenerator.download()" class="button">Download</button>
                        </div>
                        ${data.note ? `<p class="image-note">${data.note}</p>` : ''}
                    </div>
                `);
            } else if (data.loading) {
                $('#imageResult').html(`
                    <div class="loading-model">
                        <p>Stable Diffusion model is loading on HuggingFace servers.</p>
                        <p>Please wait 20-30 seconds and click Generate again.</p>
                        <button onclick="ImageGenerator.generate()" class="button retry-btn">Retry</button>
                    </div>
                `);
            } else {
                $('#imageResult').html(`<div class="error">Error: ${data.error}</div>`);
            }
        } catch (e) {
            $('#imageResult').html(`<div class="error">Error: ${e.message}</div>`);
        }

        $('#generateImageBtn').prop('disabled', false);
    },

    insertToChat() {
        if (this.history.length > 0) {
            const latest = this.history[0];
            const imgMarkdown = `![AI Generated: ${latest.prompt}](${latest.url})`;
            $('#userMessage').val($('#userMessage').val() + '\n' + imgMarkdown);
            this.close();
        }
    },

    download() {
        if (this.history.length > 0) {
            const latest = this.history[0];
            const link = document.createElement('a');
            link.href = latest.url;
            link.download = `stable-diffusion-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    },

    saveHistory() {
        const toSave = this.history.slice(0, 20).map(item => ({
            ...item,
            url: item.url.startsWith('data:') ? '' : item.url
        }));
        localStorage.setItem('chat-bowl-image-history', JSON.stringify(toSave));
    },

    loadHistory() {
        const saved = localStorage.getItem('chat-bowl-image-history');
        if (saved) {
            this.history = JSON.parse(saved).filter(item => item.url);
        }
    },

    renderHistory() {
        this.loadHistory();
        const $container = $('#imageHistory');
        if (this.history.length === 0) {
            $container.html('<div class="empty-state">No images generated yet</div>');
            return;
        }
        
        $container.html(this.history.slice(0, 6).map(item => `
            <div class="history-thumb" title="${item.prompt}">
                <img src="${item.url}" alt="${item.prompt}">
                <span class="thumb-model">${item.model || 'AI'}</span>
            </div>
        `).join(''));
    }
};

const CodeRunner = {
    open() {
        $('#codeModal').addClass('show');
        $('#codeInput').focus();
    },

    close() {
        $('#codeModal').removeClass('show');
    },

    async run() {
        const code = $('#codeInput').val();
        if (!code.trim()) return;

        $('#codeOutput').html('<div class="running">Running code...</div>');
        $('#runCodeBtn').prop('disabled', true);

        try {
            const response = await fetch('/api/execute-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const data = await response.json();
            
            let output = '';
            if (data.success) {
                output = `<div class="code-success"><strong>Output:</strong><pre>${this.escapeHtml(data.output)}</pre></div>`;
            }
            if (data.error) {
                output += `<div class="code-error"><strong>Error:</strong><pre>${this.escapeHtml(data.error)}</pre></div>`;
            }
            
            $('#codeOutput').html(output);
        } catch (e) {
            $('#codeOutput').html(`<div class="code-error">Error: ${e.message}</div>`);
        }

        $('#runCodeBtn').prop('disabled', false);
    },

    escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    insertExample() {
        $('#codeInput').val(`def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

for i in range(10):
    print(f"F({i}) = {fibonacci(i)}")`);
    }
};

const SmartReplies = {
    async getSuggestions(message) {
        try {
            const response = await fetch('/api/suggest-replies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            const data = await response.json();
            return data.suggestions || [];
        } catch {
            return [];
        }
    },

    async show(lastMessage) {
        const suggestions = await this.getSuggestions(lastMessage);
        if (suggestions.length === 0) {
            $('#smartReplies').hide();
            return;
        }

        const $container = $('#smartReplies').empty().show();
        suggestions.forEach(suggestion => {
            $('<button>')
                .addClass('smart-reply-btn')
                .text(suggestion)
                .click(() => {
                    $('#userMessage').val(suggestion);
                    updateCharCount();
                    $container.hide();
                })
                .appendTo($container);
        });
    },

    hide() {
        $('#smartReplies').hide();
    }
};

const Personas = {
    current: 'assistant',
    list: {},

    async init() {
        try {
            const response = await fetch('/api/personas');
            this.list = await response.json();
        } catch {
            this.list = { assistant: { name: 'Assistant', system: 'You are helpful.' } };
        }
        this.current = localStorage.getItem('chat-bowl-persona') || 'assistant';
        this.updateUI();
    },

    set(persona) {
        this.current = persona;
        localStorage.setItem('chat-bowl-persona', persona);
        this.updateUI();
    },

    updateUI() {
        const persona = this.list[this.current];
        if (persona) {
            $('#currentPersona').text(persona.name);
        }
    },

    open() {
        this.renderList();
        $('#personaModal').addClass('show');
    },

    close() {
        $('#personaModal').removeClass('show');
    },

    renderList() {
        const $container = $('#personaList').empty();
        
        Object.entries(this.list).forEach(([key, persona]) => {
            $('<div>')
                .addClass('persona-item' + (key === this.current ? ' active' : ''))
                .html(`<div class="persona-name">${persona.name}</div><div class="persona-desc">${persona.system.substring(0, 80)}...</div>`)
                .click(() => {
                    this.set(key);
                    $('.persona-item').removeClass('active');
                    $(event.currentTarget).addClass('active');
                })
                .appendTo($container);
        });
    }
};

const Reactions = {
    emojis: ['👍', '👎', '❤️', '😂', '🤔', '🎉', '🔥', '💡'],
    data: {},

    init() {
        const saved = localStorage.getItem('chat-bowl-reactions');
        if (saved) this.data = JSON.parse(saved);
    },

    toggle(messageIndex, emoji) {
        const key = `${currentChat.id || 'temp'}-${messageIndex}`;
        if (!this.data[key]) this.data[key] = [];
        
        const idx = this.data[key].indexOf(emoji);
        if (idx > -1) {
            this.data[key].splice(idx, 1);
        } else {
            this.data[key].push(emoji);
        }
        
        this.save();
        this.render(messageIndex);
    },

    save() {
        localStorage.setItem('chat-bowl-reactions', JSON.stringify(this.data));
    },

    get(messageIndex) {
        const key = `${currentChat.id || 'temp'}-${messageIndex}`;
        return this.data[key] || [];
    },

    render(messageIndex) {
        const reactions = this.get(messageIndex);
        const $msg = $(`.message-item[data-index="${messageIndex}"]`);
        let $reactions = $msg.find('.message-reactions');
        
        if ($reactions.length === 0) {
            $reactions = $('<div>').addClass('message-reactions');
            $msg.find('.message-body').after($reactions);
        }
        
        $reactions.empty();
        reactions.forEach(emoji => {
            $('<span>').addClass('reaction').text(emoji).appendTo($reactions);
        });
    },

    showPicker(messageIndex, x, y) {
        const $picker = $('#reactionPicker').empty();
        
        this.emojis.forEach(emoji => {
            $('<button>')
                .addClass('reaction-btn')
                .text(emoji)
                .click(() => {
                    this.toggle(messageIndex, emoji);
                    $picker.hide();
                })
                .appendTo($picker);
        });
        
        $picker.css({ left: x, top: y }).show();
    }
};

const Summarizer = {
    async summarize() {
        if (currentChat.history.length < 2) {
            alert('Need at least 2 messages to summarize.');
            return;
        }

        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: currentChat.history })
            });
            const data = await response.json();
            
            $('#summaryContent').html(marked.parse(data.summary));
            $('#summaryModal').addClass('show');
        } catch (e) {
            alert('Error summarizing: ' + e.message);
        }
    },

    close() {
        $('#summaryModal').removeClass('show');
    }
};

const VoiceInput = {
    recognition: null,
    isListening: false,

    init() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                $('#userMessage').val(transcript);
                updateCharCount();
                if (typeof TokenCounter !== 'undefined') TokenCounter.update();
            };

            this.recognition.onend = () => {
                this.isListening = false;
                $('#voiceBtn').removeClass('recording');
            };

            this.recognition.onerror = () => {
                this.isListening = false;
                $('#voiceBtn').removeClass('recording');
            };

            return true;
        }
        return false;
    },

    toggle() {
        if (!this.recognition) {
            alert('Speech recognition not supported in this browser.');
            return;
        }

        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
            this.isListening = true;
            $('#voiceBtn').addClass('recording');
        }
    }
};

const TextToSpeech = {
    synthesis: window.speechSynthesis,
    speaking: false,

    speak(text) {
        if (!this.synthesis) return;
        this.stop();

        const cleanText = text
            .replace(/```[\s\S]*?```/g, 'Code block.')
            .replace(/`[^`]+`/g, '')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/#{1,6}\s/g, '');

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.onend = () => { this.speaking = false; };
        this.synthesis.speak(utterance);
        this.speaking = true;
    },

    stop() {
        if (this.synthesis) {
            this.synthesis.cancel();
            this.speaking = false;
        }
    },

    toggle(text) {
        if (this.speaking) this.stop();
        else this.speak(text);
    }
};

const ChatSearch = {
    open() {
        $('#searchModal').addClass('show');
        $('#searchInput').focus();
    },

    close() {
        $('#searchModal').removeClass('show');
        $('#searchInput').val('');
        $('#searchResults').empty();
    },

    search(query) {
        if (!query.trim()) {
            $('#searchResults').empty();
            return;
        }

        const results = [];
        const lowerQuery = query.toLowerCase();

        currentChat.history.forEach((msg, index) => {
            if (msg.content.toLowerCase().includes(lowerQuery)) {
                results.push({
                    chatTitle: currentChat.title || 'Current Chat',
                    messageIndex: index,
                    role: msg.role,
                    content: this.highlight(msg.content, query)
                });
            }
        });

        chats.forEach(chat => {
            chat.history.forEach((msg, index) => {
                if (msg.content.toLowerCase().includes(lowerQuery)) {
                    results.push({
                        chatId: chat.id,
                        chatTitle: chat.title,
                        messageIndex: index,
                        role: msg.role,
                        content: this.highlight(msg.content, query)
                    });
                }
            });
        });

        this.displayResults(results);
    },

    highlight(text, query) {
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return text.substring(0, 100) + '...';
        const start = Math.max(0, idx - 30);
        const end = Math.min(text.length, idx + query.length + 30);
        let snippet = text.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < text.length) snippet += '...';
        return snippet.replace(new RegExp(`(${query})`, 'gi'), '<mark>$1</mark>');
    },

    displayResults(results) {
        const $container = $('#searchResults').empty();
        if (results.length === 0) {
            $container.html('<div class="empty-state">No results found</div>');
            return;
        }

        results.slice(0, 20).forEach(r => {
            $('<div>').addClass('search-result-item').html(`
                <div class="result-header">
                    <span class="result-chat">${r.chatTitle}</span>
                    <span class="result-role">${r.role}</span>
                </div>
                <div class="result-content">${r.content}</div>
            `).click(() => {
                if (r.chatId) loadChat(r.chatId);
                this.close();
            }).appendTo($container);
        });
    }
};

const Bookmarks = {
    items: [],

    init() {
        const saved = localStorage.getItem('chat-bowl-bookmarks');
        if (saved) this.items = JSON.parse(saved);
    },

    add(chatId, messageIndex, content, role) {
        this.items.unshift({
            id: Date.now(),
            chatId, messageIndex,
            content: content.substring(0, 200),
            role, timestamp: new Date().toISOString()
        });
        this.save();
    },

    remove(id) {
        this.items = this.items.filter(b => b.id !== id);
        this.save();
        this.updateUI();
    },

    save() {
        localStorage.setItem('chat-bowl-bookmarks', JSON.stringify(this.items));
    },

    open() {
        this.updateUI();
        $('#bookmarksModal').addClass('show');
    },

    close() {
        $('#bookmarksModal').removeClass('show');
    },

    updateUI() {
        const $container = $('#bookmarksList').empty();
        if (this.items.length === 0) {
            $container.html('<div class="empty-state">No bookmarks</div>');
            return;
        }

        this.items.forEach(b => {
            $('<div>').addClass('bookmark-item').html(`
                <div class="bookmark-content">${b.content}...</div>
                <div class="bookmark-meta">
                    <span>${b.role}</span>
                    <button class="bookmark-delete" data-id="${b.id}">Remove</button>
                </div>
            `).find('.bookmark-delete').click(e => {
                e.stopPropagation();
                this.remove(b.id);
            }).end().appendTo($container);
        });
    }
};

const TokenCounter = {
    count(text) {
        return Math.ceil((text || '').length / 4);
    },

    countHistory(history) {
        return history.reduce((t, m) => t + this.count(m.content), 0);
    },

    update() {
        const input = this.count($('#userMessage').val());
        const history = this.countHistory(currentChat.history);
        $('#tokenCount').text(`~${input + history} tokens`);
        $('#inputTokens').text(`Input: ~${input}`);
        $('#historyTokens').text(`History: ~${history}`);
    }
};

const ResponseTimer = {
    startTime: null,
    interval: null,

    start() {
        this.startTime = Date.now();
        this.interval = setInterval(() => {
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
            $('#responseTime').text(`${elapsed}s`).addClass('active');
        }, 100);
    },

    stop() {
        if (this.interval) clearInterval(this.interval);
        if (this.startTime) {
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
            $('#responseTime').text(`${elapsed}s`).removeClass('active');
        }
        this.startTime = null;
    },

    reset() {
        this.stop();
        $('#responseTime').text('--');
    }
};

const KeyboardShortcuts = {
    shortcuts: [
        { keys: 'Ctrl+Enter', action: 'Send message' },
        { keys: 'Ctrl+Shift+F', action: 'Search chats' },
        { keys: 'Ctrl+Shift+I', action: 'Generate image' },
        { keys: 'Ctrl+Shift+R', action: 'Run code' },
        { keys: 'Ctrl+Shift+P', action: 'Change persona' },
        { keys: 'Ctrl+Shift+B', action: 'Bookmarks' },
        { keys: 'Ctrl+L', action: 'Clear chat' },
        { keys: 'Escape', action: 'Close modal' },
    ],

    init() {
        $(document).keydown(e => {
            if (e.ctrlKey && e.shiftKey && e.key === 'F') { e.preventDefault(); ChatSearch.open(); }
            else if (e.ctrlKey && e.shiftKey && e.key === 'I') { e.preventDefault(); ImageGenerator.open(); }
            else if (e.ctrlKey && e.shiftKey && e.key === 'R') { e.preventDefault(); CodeRunner.open(); }
            else if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); Personas.open(); }
            else if (e.ctrlKey && e.shiftKey && e.key === 'B') { e.preventDefault(); Bookmarks.open(); }
            else if (e.ctrlKey && e.key === 'l') { e.preventDefault(); clearHistory(); }
            else if (e.key === 'Escape') { $('.modal').removeClass('show'); }
        });
    },

    open() {
        const $list = $('#shortcutsList').empty();
        this.shortcuts.forEach(s => {
            $list.append(`<div class="shortcut-item"><kbd>${s.keys}</kbd><span>${s.action}</span></div>`);
        });
        $('#shortcutsModal').addClass('show');
    },

    close() {
        $('#shortcutsModal').removeClass('show');
    }
};

const ChatStats = {
    open() {
        const total = currentChat.history.length;
        const user = currentChat.history.filter(m => m.role === 'user').length;
        const ai = currentChat.history.filter(m => m.role === 'assistant').length;
        const chars = currentChat.history.reduce((s, m) => s + m.content.length, 0);

        $('#statsContent').html(`
            <div class="stat-grid">
                <div class="stat-item"><div class="stat-value">${total}</div><div class="stat-label">Messages</div></div>
                <div class="stat-item"><div class="stat-value">${user}</div><div class="stat-label">Your Messages</div></div>
                <div class="stat-item"><div class="stat-value">${ai}</div><div class="stat-label">AI Responses</div></div>
                <div class="stat-item"><div class="stat-value">${chars.toLocaleString()}</div><div class="stat-label">Characters</div></div>
                <div class="stat-item"><div class="stat-value">~${TokenCounter.countHistory(currentChat.history)}</div><div class="stat-label">Tokens</div></div>
                <div class="stat-item"><div class="stat-value">${AIProviders.current}</div><div class="stat-label">Provider</div></div>
            </div>
        `);
        $('#statsModal').addClass('show');
    },

    close() {
        $('#statsModal').removeClass('show');
    }
};

const SystemPresets = {
    presets: [],

    init() {
        const saved = localStorage.getItem('chat-bowl-system-presets');
        this.presets = saved ? JSON.parse(saved) : [
            { id: 1, name: 'Helpful Assistant', prompt: 'You are helpful and friendly.' },
            { id: 2, name: 'Code Expert', prompt: 'You are an expert programmer.' },
            { id: 3, name: 'Creative Writer', prompt: 'You are a creative storyteller.' },
        ];
    },

    save() {
        localStorage.setItem('chat-bowl-system-presets', JSON.stringify(this.presets));
    },

    open() {
        this.updateUI();
        $('#presetsModal').addClass('show');
    },

    close() {
        $('#presetsModal').removeClass('show');
    },

    updateUI() {
        const $container = $('#presetsList').empty();
        this.presets.forEach(p => {
            $('<div>').addClass('preset-item').html(`
                <div class="preset-name">${p.name}</div>
                <div class="preset-actions">
                    <button class="preset-use">Use</button>
                    <button class="preset-delete">X</button>
                </div>
            `).find('.preset-use').click(() => {
                $('input[name="messageType"][value="system"]').prop('checked', true);
                $('#userMessage').val(p.prompt);
                this.close();
            }).end().find('.preset-delete').click(e => {
                e.stopPropagation();
                this.presets = this.presets.filter(x => x.id !== p.id);
                this.save();
                this.updateUI();
            }).end().appendTo($container);
        });
    }
};

const PromptTemplates = {
    templates: [],

    async init() {
        try {
            const res = await fetch('/api/templates');
            this.templates = await res.json();
        } catch { }
    },

    open() {
        this.renderTemplates();
        $('#templatesModal').addClass('show');
    },

    close() {
        $('#templatesModal').removeClass('show');
    },

    renderTemplates() {
        const $container = $('#templatesList').empty();
        const categories = [...new Set(this.templates.map(t => t.category))];

        categories.forEach(cat => {
            const $cat = $('<div>').addClass('template-category').append($('<h3>').text(cat));
            this.templates.filter(t => t.category === cat).forEach(t => {
                $('<div>').addClass('template-item').html(`
                    <div class="template-name">${t.name}</div>
                    <div class="template-preview">${t.prompt.substring(0, 60)}...</div>
                `).click(() => {
                    $('#userMessage').val(t.prompt);
                    this.close();
                }).appendTo($cat);
            });
            $container.append($cat);
        });
    }
};

function initFeatures() {
    AIProviders.init();
    VoiceInput.init();
    Bookmarks.init();
    Reactions.init();
    SystemPresets.init();
    Personas.init();
    PromptTemplates.init();
    KeyboardShortcuts.init();
    ImageGenerator.loadHistory();
    TokenCounter.update();

    $('#userMessage').on('input', () => TokenCounter.update());
    $('#searchInput').on('input', function() { ChatSearch.search($(this).val()); });

    $(document).click(() => $('#reactionPicker').hide());
    $('#reactionPicker').click(e => e.stopPropagation());
}

window.AIProviders = AIProviders;
window.ImageGenerator = ImageGenerator;
window.CodeRunner = CodeRunner;
window.SmartReplies = SmartReplies;
window.Personas = Personas;
window.Reactions = Reactions;
window.Summarizer = Summarizer;
window.VoiceInput = VoiceInput;
window.TextToSpeech = TextToSpeech;
window.ChatSearch = ChatSearch;
window.Bookmarks = Bookmarks;
window.TokenCounter = TokenCounter;
window.ResponseTimer = ResponseTimer;
window.KeyboardShortcuts = KeyboardShortcuts;
window.ChatStats = ChatStats;
window.SystemPresets = SystemPresets;
window.PromptTemplates = PromptTemplates;
window.initFeatures = initFeatures;
