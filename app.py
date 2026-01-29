from flask import Flask, render_template, request, jsonify, Response, send_from_directory
import json
import time
import random
import requests
import base64
import os

app = Flask(__name__)

# ============================================
# AI Provider Configuration
# ============================================

AI_PROVIDERS = {
    "demo": {
        "name": "Demo AI",
        "description": "Built-in demo responses",
        "requires_key": False
    },
    "groq": {
        "name": "Groq - Llama 2",
        "description": "Fast Llama 2 Chat inference",
        "requires_key": True,
        "models": ["llama2-70b-4096", "llama-3.1-8b-instant", "mixtral-8x7b-32768"]
    },
    "huggingface": {
        "name": "HuggingFace - Llama 2",
        "description": "Llama 2 Chat models",
        "requires_key": True,
        "models": ["meta-llama/Llama-2-7b-chat-hf", "meta-llama/Llama-2-13b-chat-hf"]
    }
}

# Demo responses
DEMO_RESPONSES = [
    "I understand your question. Let me think about this...\n\nBased on my analysis:\n\n1. **First consideration**: The context suggests you're looking for a comprehensive answer.\n\n2. **Second point**: There are multiple approaches we could take.\n\n3. **Recommendation**: Start with the basics and build from there.\n\nWould you like me to elaborate?",
    "That's interesting! Here's my perspective:\n\n```python\ndef solve_problem(data):\n    result = process(data)\n    return result\n```\n\nThe key insight is breaking down the problem into smaller parts.",
    "Great question! Here's a detailed response:\n\n## Overview\nThis topic has several important aspects.\n\n## Key Points\n- Point A: Foundation concepts\n- Point B: Implementation details\n- Point C: Best practices\n\n## Conclusion\nFeel free to ask follow-up questions!",
]

# Chat personas
PERSONAS = {
    "assistant": {
        "name": "Assistant",
        "system": "You are a helpful, friendly AI assistant.",
        "style": "balanced"
    },
    "coder": {
        "name": "Code Expert",
        "system": "You are an expert programmer. Provide clean, well-documented code with detailed explanations.",
        "style": "technical"
    },
    "creative": {
        "name": "Creative Writer",
        "system": "You are a creative writer with a flair for storytelling.",
        "style": "creative"
    },
    "teacher": {
        "name": "Patient Teacher",
        "system": "You are a patient, encouraging teacher. Explain concepts step by step.",
        "style": "educational"
    },
    "analyst": {
        "name": "Data Analyst",
        "system": "You are a data analyst. Provide structured analysis.",
        "style": "analytical"
    }
}

# ============================================
# Routes
# ============================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/health')
def health():
    ollama_available = check_ollama()
    return jsonify({
        "status": "ok",
        "ollama": ollama_available,
        "providers": list(AI_PROVIDERS.keys())
    })

@app.route('/api/providers')
def get_providers():
    return jsonify(AI_PROVIDERS)

@app.route('/api/personas')
def get_personas():
    return jsonify(PERSONAS)

def check_ollama():
    try:
        import ollama
        ollama.list()
        return True
    except:
        return False

@app.route('/load_model', methods=['POST'])
def load_model():
    model_name = request.form.get('model_name')
    provider = request.form.get('provider', 'ollama')
    
    if provider == 'demo' or model_name == 'demo-ai':
        return jsonify({"success": True, "demo": True})
    
    if provider in ['groq', 'huggingface']:
        return jsonify({"success": True, "provider": provider})
    
    try:
        import ollama
        ollama.chat(model=model_name, messages=[])
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/get_models')
def get_models():
    models = ["demo-ai"]
    try:
        import ollama
        ollama_models = ollama.list()
        models.extend([m['model'] for m in ollama_models['models']])
    except:
        pass
    return jsonify({'models': models})

@app.route('/ps')
def ps():
    try:
        import ollama
        models = ollama.ps()
        return jsonify({'models': [m['model'] for m in models['models']]})
    except:
        return jsonify({"models": []})

@app.route('/send_message', methods=['POST'])
def send_message():
    data = request.json
    model_name = data.get('model_name')
    provider = data.get('provider', 'ollama')
    chat_history = data.get('history', [])
    persona = data.get('persona', 'assistant')
    api_key = data.get('api_key', '')
    
    # Add persona system prompt
    if persona in PERSONAS and (not chat_history or chat_history[0].get('role') != 'system'):
        chat_history.insert(0, {
            'role': 'system',
            'content': PERSONAS[persona]['system']
        })
    
    if provider == 'demo' or model_name == 'demo-ai':
        return Response(generate_demo_response(chat_history), mimetype='text/event-stream')
    
    if provider == 'groq':
        return Response(generate_groq_response(chat_history, model_name, api_key), mimetype='text/event-stream')
    
    if provider == 'huggingface':
        return Response(generate_huggingface_response(chat_history, model_name, api_key), mimetype='text/event-stream')
    
    return Response(generate_ollama_response(chat_history, model_name), mimetype='text/event-stream')

def generate_demo_response(chat_history):
    last_message = ""
    for msg in reversed(chat_history):
        if msg.get('role') == 'user':
            last_message = msg.get('content', '').lower()
            break
    
    if 'code' in last_message or 'python' in last_message:
        response = """Here's a code example:

```python
def example_function(data):
    '''Process the input data'''
    result = []
    for item in data:
        processed = transform(item)
        result.append(processed)
    return result

# Usage
output = example_function([1, 2, 3, 4, 5])
print(output)
```

**Key concepts:**
- Functions encapsulate reusable logic
- List comprehensions can simplify this
- Add error handling for production"""
    elif 'image' in last_message or 'picture' in last_message:
        response = """To generate images, use the **Image Generator** feature!

Click the "Image" button in the toolbar, then describe what you want.

**Powered by Stable Diffusion** - enter your HuggingFace API key in provider settings for high-quality AI art."""
    else:
        response = random.choice(DEMO_RESPONSES)
    
    for char in response:
        yield f"data: {json.dumps({'content': char})}\n\n"
        if random.random() < 0.1:
            time.sleep(0.01)
    
    yield f"data: {json.dumps({'done': True})}\n\n"

def generate_groq_response(chat_history, model_name, api_key):
    """Generate response using Groq API with Llama 2"""
    if not api_key:
        yield f"data: {json.dumps({'error': 'Groq API key required. Get free key at console.groq.com'})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
        return
    
    try:
        # Default to Llama 2 model
        model = model_name or "llama2-70b-4096"
        
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "messages": chat_history,
                "stream": True,
                "max_tokens": 2048
            },
            stream=True,
            timeout=60
        )
        
        if response.status_code != 200:
            error_msg = response.text[:200]
            yield f"data: {json.dumps({'error': f'Groq API error ({response.status_code}): {error_msg}'})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return
        
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data = line[6:]
                    if data == '[DONE]':
                        break
                    try:
                        chunk = json.loads(data)
                        content = chunk.get('choices', [{}])[0].get('delta', {}).get('content', '')
                        if content:
                            yield f"data: {json.dumps({'content': content})}\n\n"
                    except:
                        pass
        
        yield f"data: {json.dumps({'done': True})}\n\n"
        
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

def generate_huggingface_response(chat_history, model_name, api_key):
    """Generate response using HuggingFace with Llama 2 Chat"""
    if not api_key:
        yield f"data: {json.dumps({'error': 'HuggingFace token required. Get free at huggingface.co/settings/tokens'})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
        return
    
    try:
        # Format for Llama 2 Chat
        prompt = ""
        for msg in chat_history:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            if role == 'system':
                prompt += f"[INST] <<SYS>>\n{content}\n<</SYS>>\n\n"
            elif role == 'user':
                if prompt and not prompt.endswith("[INST] "):
                    prompt += f"[INST] {content} [/INST]"
                else:
                    prompt += f"{content} [/INST]"
            elif role == 'assistant':
                prompt += f" {content} </s><s>"
        
        model = model_name or "meta-llama/Llama-2-7b-chat-hf"
        
        response = requests.post(
            f"https://api-inference.huggingface.co/models/{model}",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": 1024,
                    "temperature": 0.7,
                    "return_full_text": False,
                    "do_sample": True
                }
            },
            timeout=120
        )
        
        if response.status_code == 503:
            yield f"data: {json.dumps({'error': 'Model is loading, please try again in 20-30 seconds...'})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return
        
        if response.status_code != 200:
            yield f"data: {json.dumps({'error': f'HuggingFace error ({response.status_code}): {response.text[:200]}'})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return
        
        result = response.json()
        if isinstance(result, list) and len(result) > 0:
            text = result[0].get('generated_text', '')
            for char in text:
                yield f"data: {json.dumps({'content': char})}\n\n"
        
        yield f"data: {json.dumps({'done': True})}\n\n"
        
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

def generate_ollama_response(chat_history, model_name):
    try:
        import ollama
        for chunk in ollama.chat(model=model_name, messages=chat_history, stream=True):
            if chunk.get("done", False):
                yield f"data: {json.dumps({'done': True})}\n\n"
                break
            content = chunk.get("message", {}).get("content", "")
            yield f"data: {json.dumps({'content': content})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

@app.route('/stop_model', methods=['POST'])
def stop_model():
    model_name = request.form.get('model_name')
    if model_name == "demo-ai":
        return jsonify({"success": True})
    try:
        import ollama
        ollama.chat(model=str(model_name), keep_alive='0')
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================
# Stable Diffusion Image Generation
# ============================================

@app.route('/api/generate-image', methods=['POST'])
def generate_image():
    """Generate image using Stable Diffusion via HuggingFace"""
    data = request.json
    prompt = data.get('prompt', '')
    api_key = data.get('api_key', '')
    
    if not prompt:
        return jsonify({"error": "Prompt required"}), 400
    
    # Try HuggingFace Stable Diffusion if API key provided
    if api_key:
        try:
            # Use Stable Diffusion 2.1 model
            model_id = "stabilityai/stable-diffusion-2-1"
            
            response = requests.post(
                f"https://api-inference.huggingface.co/models/{model_id}",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"inputs": prompt},
                timeout=120
            )
            
            if response.status_code == 503:
                # Model loading, return status
                return jsonify({
                    "error": "Stable Diffusion model is loading. Please wait 20-30 seconds and try again.",
                    "loading": True
                }), 503
            
            if response.status_code == 200:
                # Success - return base64 image
                image_bytes = response.content
                image_base64 = base64.b64encode(image_bytes).decode('utf-8')
                
                return jsonify({
                    "success": True,
                    "image_base64": image_base64,
                    "prompt": prompt,
                    "model": "Stable Diffusion 2.1"
                })
            else:
                return jsonify({
                    "error": f"HuggingFace error ({response.status_code}): {response.text[:200]}"
                }), response.status_code
                
        except requests.Timeout:
            return jsonify({"error": "Request timeout. The model might be loading, try again."}), 504
        except Exception as e:
            return jsonify({"error": f"Error: {str(e)}"}), 500
    
    # Fallback: Use Pollinations.ai (free, no API key needed)
    else:
        try:
            import urllib.parse
            encoded_prompt = urllib.parse.quote(prompt)
            # Pollinations generates image from URL
            image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true"
            
            return jsonify({
                "success": True,
                "image_url": image_url,
                "prompt": prompt,
                "model": "Pollinations (free fallback)",
                "note": "Add HuggingFace API key for Stable Diffusion quality"
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

# ============================================
# Other API Endpoints
# ============================================

@app.route('/api/suggest-replies', methods=['POST'])
def suggest_replies():
    data = request.json
    last_message = data.get('message', '').lower()
    
    suggestions = []
    if '?' in last_message:
        suggestions = ["Yes, that's correct.", "No, let me explain...", "Could you clarify?"]
    elif 'thank' in last_message:
        suggestions = ["You're welcome!", "Happy to help!", "Let me know if you need more."]
    elif 'code' in last_message:
        suggestions = ["Show me an example?", "What language?", "Any edge cases?"]
    else:
        suggestions = ["Tell me more.", "Can you explain?", "What's next?"]
    
    return jsonify({"suggestions": suggestions[:3]})

@app.route('/api/summarize', methods=['POST'])
def summarize_chat():
    data = request.json
    messages = data.get('messages', [])
    
    if len(messages) < 2:
        return jsonify({"summary": "Conversation too short to summarize."})
    
    summary_parts = [f"**Conversation Summary** ({len(messages)} messages)\n"]
    
    topics = set()
    for msg in messages:
        content = msg.get('content', '').lower()
        if 'code' in content: topics.add('coding')
        if 'help' in content: topics.add('assistance')
        if 'error' in content: topics.add('debugging')
        if 'explain' in content: topics.add('explanations')
        if 'image' in content: topics.add('image generation')
    
    if topics:
        summary_parts.append(f"**Topics:** {', '.join(topics)}\n")
    
    user_count = len([m for m in messages if m.get('role') == 'user'])
    ai_count = len([m for m in messages if m.get('role') == 'assistant'])
    
    summary_parts.append(f"- User messages: {user_count}")
    summary_parts.append(f"- AI responses: {ai_count}")
    
    return jsonify({"summary": '\n'.join(summary_parts)})

@app.route('/api/execute-code', methods=['POST'])
def execute_code():
    data = request.json
    code = data.get('code', '')
    
    if not code:
        return jsonify({"error": "No code provided"}), 400
    
    import io
    import sys
    from contextlib import redirect_stdout, redirect_stderr
    
    safe_builtins = {
        'print': print, 'len': len, 'range': range, 'str': str,
        'int': int, 'float': float, 'list': list, 'dict': dict,
        'tuple': tuple, 'set': set, 'bool': bool, 'sum': sum,
        'min': min, 'max': max, 'abs': abs, 'round': round,
        'sorted': sorted, 'enumerate': enumerate, 'zip': zip,
        'map': map, 'filter': filter, 'True': True, 'False': False,
        'None': None,
    }
    
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    try:
        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            exec(code, {"__builtins__": safe_builtins}, {})
        
        return jsonify({
            "success": True,
            "output": stdout_capture.getvalue() or "(No output)",
            "error": stderr_capture.getvalue() or None
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "output": "",
            "error": str(e)
        })

@app.route('/api/templates')
def get_templates():
    templates = [
        {"id": 1, "name": "Code Review", "category": "Development", "prompt": "Review this code for bugs, performance, and best practices:\n\n```\n[paste code]\n```"},
        {"id": 2, "name": "Explain Simply", "category": "Learning", "prompt": "Explain this concept in simple terms with examples:\n\n"},
        {"id": 3, "name": "Debug Error", "category": "Development", "prompt": "Help me debug this error:\n\nError:\n```\n[paste error]\n```\n\nCode:\n```\n[paste code]\n```"},
        {"id": 4, "name": "Summarize", "category": "Writing", "prompt": "Summarize in 3-5 bullet points:\n\n"},
        {"id": 5, "name": "Write Tests", "category": "Development", "prompt": "Write unit tests for:\n\n```\n[paste function]\n```"},
        {"id": 6, "name": "Improve Writing", "category": "Writing", "prompt": "Improve for clarity and grammar:\n\n"},
        {"id": 7, "name": "Generate Ideas", "category": "Creative", "prompt": "Generate 10 creative ideas for:\n\n"},
        {"id": 8, "name": "SQL Query", "category": "Development", "prompt": "Write a SQL query to:\n\nTable structure:\n"},
        {"id": 9, "name": "Stable Diffusion Prompt", "category": "Image", "prompt": "Create a detailed Stable Diffusion prompt for: "},
        {"id": 10, "name": "Pros and Cons", "category": "Analysis", "prompt": "List pros and cons of:\n\n"},
    ]
    return jsonify(templates)

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    app.run(debug=True)
