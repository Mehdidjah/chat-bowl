let currentChat = {
    id: null,
    model: '',
    history: [],
    temporary: true
};
let chats = [];
let availableModels = [];
let runningModels = [];
let isDarkTheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
let isDemoMode = false;
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true
});
$(document).ready(function() {
    initializeApp();
    setupEventListeners();
    checkOllamaStatus();
    updateCharCount();
    if (typeof initFeatures === 'function') {
        initFeatures();
    }
});
function initializeApp() {
    updateModelLists();
    loadChats();
    createTemporaryChat();
    loadThemePreference();
}
function checkOllamaStatus() {
    $.get("/health")
        .done(function(data) {
            if (data.ollama) {
                $("#ollama-status").removeClass("error").addClass("success");
                $("#ollama-status .status-text").text("Ollama Connected");
                isDemoMode = false;
            } else {
                $("#ollama-status").removeClass("error").addClass("demo");
                $("#ollama-status .status-text").text("Demo Mode Active");
                isDemoMode = true;
                $(".welcome-message .tips").prepend(`
                    <div class="tip info">
                        <span class="tip-icon">i</span>
                        <span>Running in Demo Mode. Select "demo-ai" to try the interface. Install Ollama for full AI capabilities.</span>
                    </div>
                `);
            }
        })
        .fail(function() {
            $("#ollama-status").removeClass("success").addClass("error");
            $("#ollama-status .status-text").text("Server Offline");
        });
}
function setupEventListeners() {
    $("#sendMessage").click(() => sendMessage(true));
    $("#sendWithoutResponse").click(() => sendMessage(false));
    $("#continueButton").click(continueConversation);
    $("#saveEdit").click(saveEditedMessage);
    $("#cancelEdit").click(closeEditModal);
    $("#clearHistory").click(clearHistory);
    $("#saveChat").click(saveCurrentChat);
    $("#refreshButton").click(updateModelLists);
    $("#themeToggle").click(toggleTheme);
    $("#searchBtn").click(() => ChatSearch.open());
    $("#shortcutsBtn").click(() => KeyboardShortcuts.open());
    $("#userMessage").on("input", updateCharCount);
    $('input[name="messageType"]').change(function() {
        const isSystem = $(this).val() === 'system';
        $("#continueButton").toggle(!isSystem);
    });
    const dropZone = $("#dropZone")[0];
    dropZone.addEventListener("dragover", function (e) {
        e.preventDefault();
        $(this).addClass("drag-over");
    });
    dropZone.addEventListener("dragleave", function (e) {
        e.preventDefault();
        $(this).removeClass("drag-over");
    });
    dropZone.addEventListener("drop", function (e) {
        e.preventDefault();
        $(this).removeClass("drag-over");
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith("image/")) {
            $("#imageInput")[0].files = files;
            const reader = new FileReader();
            reader.onload = function (e) {
                showImagePreview(e.target.result);
            };
            reader.readAsDataURL(files[0]);
        }
    });
    setupChatHistoryContextMenu();
    setupMessageContextMenu();
    $("#userMessage").keydown(function(e) {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            $("#sendMessage").click();
        }
    });
}
function updateCharCount() {
    const count = $("#userMessage").val().length;
    $("#charCount").text(`${count} character${count !== 1 ? 's' : ''}`);
    if (typeof TokenCounter !== 'undefined') {
        TokenCounter.update();
    }
}
function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    applyTheme();
    localStorage.setItem('chat-bowl-theme', isDarkTheme ? 'dark' : 'light');
}
function loadThemePreference() {
    const saved = localStorage.getItem('chat-bowl-theme');
    if (saved) {
        isDarkTheme = saved === 'dark';
    }
    applyTheme();
}
function applyTheme() {
    if (isDarkTheme) {
        document.documentElement.setAttribute('data-theme', 'dark');
        $("#hljs-theme").attr('href', 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
        $("#themeToggle").html('&#xE706;');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        $("#hljs-theme").attr('href', 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css');
        $("#themeToggle").html('&#xE708;');
    }
}
function exportChat() {
    if (currentChat.history.length === 0) {
        appendMessage("Info", "No messages to export.");
        return;
    }
    const exportData = {
        title: currentChat.title || "Temporary Session",
        model: currentChat.model,
        exportDate: new Date().toISOString(),
        messages: currentChat.history
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-bowl-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    appendMessage("Info", "Chat exported successfully.");
}
function updateModelLists() {
    const loadingHtml = `<loading>
        <svg width="35px" height="35px" viewBox="0 0 16 16">
            <circle cx="8px" cy="8px" r="6px"></circle>
        </svg>
    </loading>`;
    $("#running-models").html(loadingHtml);
    $("#available-models").html(loadingHtml);
    $.get("/ps").done(data => {
        runningModels = data.models || [];
        const $container = $("#running-models").empty();
        if (runningModels.length === 0) {
            $container.html('<div class="empty-state">No models running</div>');
        } else {
            runningModels.forEach(model => {
                const $card = $('<div>').addClass('model-card')
                    .append($('<div>').addClass('model-name').text(model))
                    .append(
                        $('<div>').addClass('card-buttons')
                            .append($('<button>').addClass('button primary').text('New Chat').click(() => createNewChat(model)))
                            .append($('<button>').addClass('button').text('Stop').click(() => stopModel(model)))
                    );
                $container.append($card);
            });
        }
        $.get("/get_models").done(data => {
            availableModels = data.models || [];
            const $container = $("#available-models").empty();
            if (availableModels.length === 0) {
                $container.html('<div class="empty-state">No models found</div>');
            } else {
                availableModels.forEach(model => {
                    const isRunning = runningModels.includes(model);
                    const isDemo = model === 'demo-ai';
                    $container.append(
                        $('<a>', {
                            class: `a ${isRunning ? 'disabled-model' : ''} ${isDemo ? 'demo-model' : ''}`,
                            html: isDemo ? '[Demo] Built-in AI' : (isRunning ? '* ' + model : model),
                            onclick: isRunning ? null : `loadModel('${model}')`
                        })
                    );
                });
            }
        });
    });
}
function createNewChat(model) {
    if (currentChat.history.length > 0 && !currentChat.temporary) {
        saveCurrentChat();
    }
    createTemporaryChat(model);
}
function createTemporaryChat(model = '') {
    currentChat = {
        id: null,
        model: model,
        history: [],
        temporary: true
    };
    clearHistory();
    updateCurrentChatDisplay();
}
function updateCurrentChatDisplay() {
    $("#current-chat-title").text(currentChat.temporary ? "Temporary Session" : currentChat.title);
    $("#current-chat-model").text(currentChat.model || 'No model');
    $("#saveChat").toggle(currentChat.temporary && currentChat.history.length > 0);
    if (typeof TokenCounter !== 'undefined') {
        TokenCounter.update();
    }
}
function saveCurrentChat() {
    if (currentChat.history.length === 0) return;
    const timestamp = Date.now();
    if (currentChat.temporary) {
        currentChat.id = timestamp;
        currentChat.temporary = false;
        currentChat.title = `${currentChat.model} - ${new Date(timestamp).toLocaleString()}`;
        chats.push({...currentChat});
    } else {
        const index = chats.findIndex(c => c.id === currentChat.id);
        if (index !== -1) {
            chats[index] = {...currentChat};
        }
    }
    saveChatsToStorage();
    updateChatHistoryView();
    updateCurrentChatDisplay();
    appendMessage("Info", "Chat saved.");
}
function loadChat(chatId) {
    if (currentChat.temporary && currentChat.history.length > 0) {
        if (!confirm("This is an unsaved temporary session. Switch anyway?")) {
            return;
        }
    }
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
        currentChat = {...chat};
        updateCurrentChatDisplay();
        displayChat(currentChat.history);
    }
}
function displayChat(history) {
    $("#conversation").empty();
    hideWelcome();
    history.forEach((msg, index) => {
        appendMessage(msg.role, msg.content, index, msg.images);
    });
}
function updateChatHistoryView() {
    const $container = $("#chat-history").empty();
    if (chats.length === 0) {
        $container.html('<div class="empty-state">No saved chats</div>');
        return;
    }
    chats.sort((a, b) => b.id - a.id).forEach(chat => {
        $container.append(
            $('<a>', {
                class: 'a',
                text: chat.title,
                'data-chat-id': chat.id,
                onclick: `loadChat(${chat.id})`
            })
        );
    });
}
function saveChatsToStorage() {
    localStorage.setItem('ollama-chats', JSON.stringify(chats));
}
function loadChats() {
    const saved = localStorage.getItem('ollama-chats');
    if (saved) {
        chats = JSON.parse(saved);
        updateChatHistoryView();
    }
}
function loadModel(v) {
    const $modelItem = $(`#available-models .a`).filter(function() {
        return $(this).text().includes(v) || (v === 'demo-ai' && $(this).text().includes('Demo'));
    });
    $modelItem.html(
        `<loading>
            <svg width="16px" height="16px" viewBox="0 0 16 16">
                <circle cx="8px" cy="8px" r="6px"></circle>
            </svg>
        </loading> Loading...`
    );
    $.post("/load_model", { model_name: v })
        .done(function (data) {
            if (v === 'demo-ai') {
                runningModels.push('demo-ai');
                createNewChat('demo-ai');
                appendMessage("Info", "Demo AI activated. This is a built-in demo mode for testing the interface.");
            } else {
                updateModelLists();
                appendMessage("Info", `Model "${v}" loaded successfully.`);
            }
            checkOllamaStatus();
        })
        .fail(function () {
            appendMessage("Info", `Failed to load model "${v}".`);
            updateModelLists();
        });
}
function hideWelcome() {
    $(".welcome-message").fadeOut(300);
}
function sendMessage(withResponse = true) {
    if (!currentChat.model) {
        appendMessage("Info", "Please select a model before starting a conversation.");
        return;
    }
    if (!runningModels.includes(currentChat.model) && currentChat.model !== 'demo-ai') {
        appendMessage("Info", "Model is not running. Please load the model first.");
        return;
    }
    const messageType = $('input[name="messageType"]:checked').val();
    const message = $("#userMessage").val();
    const imageInput = $("#imageInput")[0];
    const model = currentChat.model;
    if (!message.trim() && !imageInput.files[0]) return;
    hideWelcome();
    if (messageType == 'system') {
        currentChat.history.push({
            role: 'system',
            content: message
        });
        appendMessage(messageType, message, currentChat.history.length - 1);
        if (!currentChat.temporary) {
            saveCurrentChat();
        }
        clearInput();
        return;
    }
    if (imageInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const base64Image = e.target.result.split(",")[1];
            sendMessageWithImage(message, base64Image, messageType, model, withResponse);
        };
        reader.readAsDataURL(imageInput.files[0]);
    } else {
        sendMessageWithoutImage(message, messageType, model, withResponse);
    }
}
function sendMessageWithImage(message, base64Image, messageType, model, withResponse) {
    appendMessage(messageType, message, currentChat.history.length, [base64Image]);
    currentChat.history.push({
        role: messageType,
        content: message,
        images: [base64Image],
    });
    if (withResponse) {
        const requestData = {
            model_name: model,
            history: currentChat.history,
        };
        sendRequest(requestData);
    }
    clearInput();
    updateCurrentChatDisplay();
}
function sendMessageWithoutImage(message, messageType, model, withResponse) {
    appendMessage(messageType, message, currentChat.history.length);
    currentChat.history.push({
        role: messageType,
        content: message,
    });
    if (withResponse) {
        const requestData = {
            model_name: model,
            history: currentChat.history,
        };
        sendRequest(requestData);
    }
    clearInput();
    updateCurrentChatDisplay();
}
function continueConversation() {
    if (!currentChat.model) {
        appendMessage("Info", "Please select a model before starting a conversation.");
        return;
    }
    if (!runningModels.includes(currentChat.model) && currentChat.model !== 'demo-ai') {
        appendMessage("Info", "Model is not running. Please load the model first.");
        return;
    }
    const requestData = {
        model_name: currentChat.model,
        history: [...currentChat.history.concat([{
            role:'user',
            content:'\n'
        }])],
    };
    sendRequest(requestData);
}
function clearInput() {
    $("#userMessage").val("");
    $("#imageInput").val("");
    $(".image-preview").remove();
    updateCharCount();
}
function sendRequest(requestData) {
    $("#sendMessage, #sendWithoutResponse, #continueButton").prop('disabled', true);
    if (typeof ResponseTimer !== 'undefined') {
        ResponseTimer.start();
    }
    if (typeof AIProviders !== 'undefined') {
        requestData.provider = AIProviders.current;
        requestData.api_key = AIProviders.getApiKey(AIProviders.current);
    }
    if (typeof Personas !== 'undefined') {
        requestData.persona = Personas.current;
    }
    fetch("/send_message", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
    }).then((response) => {
        const reader = response.body.getReader();
        let decoder = new TextDecoder();
        let buffer = "";
        function readStream() {
            reader.read().then(({ done, value }) => {
                if (done) return;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop();
                lines.forEach((line) => {
                    if (line.startsWith("data: ")) {
                        const data = JSON.parse(line.slice(6));
                        handleStreamResponse(data);
                    }
                });
                readStream();
            });
        }
        readStream();
    }).catch(error => {
        appendMessage("Info", "Error: " + error.message);
        if (typeof ResponseTimer !== 'undefined') {
            ResponseTimer.stop();
        }
    }).finally(() => {
        $("#sendMessage, #sendWithoutResponse, #continueButton")
            .prop('disabled', false)
            .find('loading')
            .remove();
    });
}
function stopModel(v) {
    console.log(v);
    if (window.messageSource) {
        window.messageSource.close();
    }
    $.post("/stop_model", { model_name: v })
        .done(function (data) {
            appendMessage("Info", v + " has been stopped.");
            updateModelLists();
        })
        .fail(function () {
            appendMessage("Info", "Failed to stop model.");
        });
}
function renderMarkdown(content) {
    try {
        return marked.parse(content);
    } catch (e) {
        return content;
    }
}
function appendMessage(sender, content, index, images = null) {
    const $conversation = $("#conversation");
    const messageClass = `message-item ${sender.toLowerCase()}-message`;
    const $item = $("<div>").addClass(messageClass).attr("data-index", index);
    const $header = $("<div>").addClass("message-header");
    const senderLabels = {
        user: 'You',
        system: 'System',
        info: 'Info',
        assistant: 'AI'
    };
    $header.append($("<span>").addClass("sender").text(senderLabels[sender.toLowerCase()] || sender));
    if (sender.toLowerCase() !== 'info') {
        const $actions = $("<div>").addClass("message-actions");
        const $copyBtn = $("<button>")
            .addClass("action-btn")
            .html("&#xE8C8;")
            .attr("title", "Copy")
            .click(function(e) {
                e.stopPropagation();
                navigator.clipboard.writeText(content);
                $(this).addClass("copied");
                setTimeout(() => $(this).removeClass("copied"), 1500);
            });
        $actions.append($copyBtn);
        if (sender.toLowerCase() === 'assistant' && typeof TextToSpeech !== 'undefined') {
            const $ttsBtn = $("<button>")
                .addClass("action-btn")
                .html("&#xE767;")
                .attr("title", "Read aloud")
                .click(function(e) {
                    e.stopPropagation();
                    TextToSpeech.toggle(content);
                });
            $actions.append($ttsBtn);
        }
        if (typeof Bookmarks !== 'undefined' && index !== undefined) {
            const $bookmarkBtn = $("<button>")
                .addClass("action-btn")
                .html("&#xE734;")
                .attr("title", "Bookmark")
                .click(function(e) {
                    e.stopPropagation();
                    Bookmarks.add(currentChat.id, index, content, sender);
                    $(this).addClass("bookmarked");
                });
            $actions.append($bookmarkBtn);
        }
        $header.append($actions);
    }
    const $body = $("<div>").addClass("message-body");
    if (sender.toLowerCase() === 'assistant') {
        $body.html(renderMarkdown(content));
        $body.find('pre code').each(function() {
            hljs.highlightElement(this);
        });
    } else {
        $body.text(content);
    }
    if (images && images.length > 0) {
        const $imgContainer = $("<div>").addClass("image-container");
        images.forEach((imgData) => {
            const $img = $("<img>")
                .attr("src", `data:image/png;base64,${imgData}`)
                .addClass("message-image")
                .click(() => showImageModal(imgData));
            $imgContainer.append($img);
        });
        $body.append($imgContainer);
    }
    if(sender!='Info')
        $item.dblclick(() => editMessage(index));
    $item.append($header, $body);
    $conversation.append($item);
    $conversation.scrollTop($conversation[0].scrollHeight);
}
function editMessage(index) {
    const message = currentChat.history[index];
    currentEditingIndex = index;
    $("#editMessageContent").val(message.content);
    $("#editModal").addClass('show');
}
function saveEditedMessage() {
    const newContent = $("#editMessageContent").val();
    if (newContent !== currentChat.history[currentEditingIndex].content) {
        currentChat.history[currentEditingIndex].content = newContent;
        updateConversationDisplay();
        if (!currentChat.temporary) {
            const chatIndex = chats.findIndex(c => c.id === currentChat.id);
            if (chatIndex !== -1) {
                chats[chatIndex] = {...currentChat};
                saveChatsToStorage();
            }
        }
    }
    closeEditModal();
}
function closeEditModal() {
    $("#editModal").removeClass('show');
    currentEditingIndex = -1;
}
function deleteMessage(index) {
    currentChat.history.splice(index, 1);
    updateConversationDisplay();
    if (!currentChat.temporary) {
        const chatIndex = chats.findIndex(c => c.id === currentChat.id);
        if (chatIndex !== -1) {
            chats[chatIndex] = {...currentChat};
            saveChatsToStorage();
        }
    }
}
function updateConversationDisplay() {
    $("#conversation").empty()
    currentChat.history.forEach((msg, index) => {
        appendMessage(msg.role, msg.content, index, msg.images);
    });
}
function clearHistory() {
    currentChat.history = [];
    $("#conversation").empty();
    $(".welcome-message").fadeIn(300);
    appendMessage('Info', 'Chat cleared. Ready for a new conversation.')
    if (!currentChat.temporary) {
        const index = chats.findIndex(c => c.id === currentChat.id);
        if (index !== -1) {
            chats[index] = {...currentChat};
            saveChatsToStorage();
        }
    }
    updateCurrentChatDisplay();
    if (typeof ResponseTimer !== 'undefined') {
        ResponseTimer.reset();
    }
}
function handleStreamResponse(data) {
    if (!window.currentResponse) {
        const $item = $("<div>").addClass('message-item assistant-message');
        const $header = $("<div>").addClass("message-header");
        $header.append($("<span>").addClass("sender").text('AI'));
        const $body = $("<div>").addClass("message-body");
        $item.append($header, $body);
        window.currentResponse = {
            element: $item,
            content: "",
        };
        const loadingHtml = `<loading>
            <svg width="16px" height="16px" viewBox="0 0 16 16">
                <circle cx="8px" cy="8px" r="6px"></circle>
            </svg>
        </loading>`;
        window.currentResponse.element.find('.message-header').append(loadingHtml);
        $("#conversation").append(window.currentResponse.element);
        if(window.isregenerate){
            window.historyAfterIndex.forEach((msg, index) => {
                appendMessage(msg.role, msg.content, currentChat.history.length+1+index);
            });
        }
    }
    if (data.content) {
        window.currentResponse.content += data.content;
        window.currentResponse.element
            .find(".message-body")
            .html(renderMarkdown(window.currentResponse.content));
        window.currentResponse.element.find('pre code').each(function() {
            hljs.highlightElement(this);
        });
        if(!window.isregenerate)
            $("#conversation").scrollTop($("#conversation")[0].scrollHeight);
    }
    if (data.done) {
        if (typeof ResponseTimer !== 'undefined') {
            ResponseTimer.stop();
        }
        if (window.currentResponse) {
            currentChat.history.push({
                role: "assistant",
                content: window.currentResponse.content,
            });
            const index = currentChat.history.length - 1;
            const content = window.currentResponse.content;
            const $actions = $("<div>").addClass("message-actions");
            const $copyBtn = $("<button>")
                .addClass("action-btn")
                .html("&#xE8C8;")
                .attr("title", "Copy")
                .click(function(e) {
                    e.stopPropagation();
                    navigator.clipboard.writeText(content);
                    $(this).addClass("copied");
                    setTimeout(() => $(this).removeClass("copied"), 1500);
                });
            $actions.append($copyBtn);
            if (typeof TextToSpeech !== 'undefined') {
                const $ttsBtn = $("<button>")
                    .addClass("action-btn")
                    .html("&#xE767;")
                    .attr("title", "Read aloud")
                    .click(function(e) {
                        e.stopPropagation();
                        TextToSpeech.toggle(content);
                    });
                $actions.append($ttsBtn);
            }
            if (typeof Bookmarks !== 'undefined') {
                const $bookmarkBtn = $("<button>")
                    .addClass("action-btn")
                    .html("&#xE734;")
                    .attr("title", "Bookmark")
                    .click(function(e) {
                        e.stopPropagation();
                        Bookmarks.add(currentChat.id, index, content, 'assistant');
                        $(this).addClass("bookmarked");
                    });
                $actions.append($bookmarkBtn);
            }
            window.currentResponse.element.find('.message-header').append($actions);
            window.currentResponse.element.attr("data-index", index);
            if(window.isregenerate){
                currentChat.history.push.apply(currentChat.history, window.historyAfterIndex);
                window.historyAfterIndex = null;
                window.isregenerate = false;
            }
            window.currentResponse.element.find('.message-header>loading').remove();
        }
        if (!currentChat.temporary) {
            saveCurrentChat();
        }
        updateCurrentChatDisplay();
        window.currentResponse = null;
    }
    if (data.error) {
        appendMessage("Info", "Error: " + data.error);
        if (typeof ResponseTimer !== 'undefined') {
            ResponseTimer.stop();
        }
    }
}
function showImagePreview(dataUrl) {
    const $preview = $("<div>").addClass("image-preview");
    const $img = $("<img>").attr("src", dataUrl).addClass("preview-image");
    const $removeBtn = $("<button>")
        .text("x")
        .addClass("remove-preview")
        .click(() => {
            $preview.remove();
            $("#imageInput").val("");
        });
    $preview.append($img, $removeBtn);
    $("#dropZone").append($preview);
}
function showCm(items, x, y) {
    const menu = $("#cms");
    const menuItems = menu.find(".menu-items");
    menuItems.empty();
    items.forEach(item => {
        const $item = $('<div>')
            .addClass('menu-item')
            .html(`<i>${item.icon}</i>${item.text}`)
            .click(() => {
                item.action();
                hideCm();
            });
        menuItems.append($item);
    });
    const menuWidth = menu.outerWidth();
    const menuHeight = menu.outerHeight();
    const windowWidth = $(window).width();
    const windowHeight = $(window).height();
    if (x + menuWidth > windowWidth) x = windowWidth - menuWidth;
    if (y + menuHeight > windowHeight) y = windowHeight - menuHeight;
    menu.css({ left: x, top: y, display: 'block' });
}
function hideCm() {
    $("#cms").hide();
}
$(document).click(() => hideCm());
$("#cms").click(e => e.stopPropagation());
function setupChatHistoryContextMenu() {
    $("#chat-history").on("contextmenu", ".a", function(e) {
        e.preventDefault();
        const chatId = $(this).data("chat-id");
        showCm([
            {
                icon: "&#xe8ac;",
                text: "Rename",
                action: () => showRenameDialog(chatId)
            },
            {
                icon: "&#xe74d;",
                text: "Delete",
                action: () => deleteChat(chatId)
            }
        ], e.pageX, e.pageY);
    });
}
function setupMessageContextMenu() {
    $("#conversation").on("contextmenu", ".message-item:not(.info-message)", function(e) {
        e.preventDefault();
        const index = $(this).data("index");
        const isAI = $(this).hasClass("assistant-message");
        const menuItems = [
            {
                icon: "&#xE74D;", 
                text: "Delete Message",
                action: () => deleteMessage(index)
            },
            {
                icon: "&#xe70f;",
                text: "Edit Content",
                action: () => editMessage(index)
            },
            {
                icon: "&#xe8c8;",
                text: "Copy Content",
                action: () => copyMessageContent(index)
            }
        ];
        if (isAI) {
            menuItems.push({
                icon: "&#xe72c;",
                text: "Regenerate Response",
                action: () => regenerateResponse(index)
            });
        }
        if (typeof Bookmarks !== 'undefined') {
            menuItems.push({
                icon: "&#xE734;",
                text: "Add Bookmark",
                action: () => {
                    const msg = currentChat.history[index];
                    Bookmarks.add(currentChat.id, index, msg.content, msg.role);
                }
            });
        }
        showCm(menuItems, e.pageX, e.pageY);
    });
}
function showRenameDialog(chatId) {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    $("#newChatName").val(chat.title || `Chat ${new Date(chat.id).toLocaleString()}`);
    $("#renameModal").addClass("show");
    $("#saveRename").off().on("click", () => {
        const newName = $("#newChatName").val().trim();
        if (newName) {
            chat.title = newName;
            saveChatsToStorage();
            updateChatHistoryView();
            if (currentChat.id === chatId) {
                $("#current-chat-title").text(newName);
            }
        }
        $("#renameModal").removeClass("show");
    });
    $("#cancelRename").off().on("click", () => {
        $("#renameModal").removeClass("show");
    });
}
function deleteChat(chatId) {
    if (confirm("Delete this chat?")) {
        const index = chats.findIndex(c => c.id === chatId);
        if (index !== -1) {
            chats.splice(index, 1);
            saveChatsToStorage();
            updateChatHistoryView();
            if (currentChat.id === chatId) {
                createTemporaryChat();
            }
        }
    }
}
function regenerateResponse(index) {
    const historyBeforeIndex = currentChat.history.slice(0, index);
    const historyAfterIndex = currentChat.history.slice(index + 1);
    window.historyAfterIndex = historyAfterIndex;
    currentChat.history = historyBeforeIndex;
    window.isregenerate = true;
    updateConversationDisplay();
    const requestData = {
        model_name: currentChat.model,
        history: historyBeforeIndex
    };
    sendRequest(requestData);
}
function copyMessageContent(index) {
    const message = currentChat.history[index];
    navigator.clipboard.writeText(message.content)
        .then(() => appendMessage("Info", "Copied to clipboard."))
        .catch(() => appendMessage("Info", "Copy failed."));
}
