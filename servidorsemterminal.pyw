#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servidor Web - Versão .pyw (sem console) com log e fechamento rápido
"""

import sys
import os
import threading
import http.server
import socketserver
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import messagebox
import pystray
from pystray import MenuItem as item
from PIL import Image, ImageDraw
import json
import logging
import time
import signal
import atexit

with open('config.json', 'r') as config_file:
        config = json.load(config_file)

# Configuração do logging
logging.basicConfig(
    filename='webserver.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class FastShutdownTCPServer(socketserver.TCPServer):
    """Servidor TCP com fechamento rápido"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.allow_reuse_address = True
        self.timeout = 0.5
        self._shutdown_request = False
    
    def shutdown(self):
        self._shutdown_request = True
        super().shutdown()

class WebServerTray:
    def __init__(self):
        self.server = None
        self.server_thread = None
        self.port = config.get('port', 8003)
        self.icon_name = config.get('icon_name', 'WebServer')
        self.running = False
        self.script_dir = Path(__file__).parent.absolute()
        self.icon = None
        self.is_closing = False
        logging.info("Aplicação iniciada")
        
        # Registra função de limpeza
        atexit.register(self.force_cleanup)
        
    def create_image(self, color="red"):
        """Cria ícone para o system tray"""
        try:
            image = Image.new('RGB', (64, 64), color='white')
            dc = ImageDraw.Draw(image)
            fill_color = 'green' if color == "green" else 'red'
            dc.rectangle([16, 16, 48, 48], fill=fill_color)
            return image
        except:
            # Fallback se PIL falhar
            return Image.new('RGB', (64, 64), color='red')
    
    def start_server(self):
        """Inicia o servidor web"""
        if self.running or self.is_closing:
            if not self.is_closing:
                self.show_message("Servidor já está rodando!")
                logging.warning("Tentativa de iniciar servidor já rodando")
            return
            
        try:
            # Atualiza o diretório atual explicitamente
            self.script_dir = Path(__file__).parent.absolute()
            os.chdir(self.script_dir)
            
            if not Path('index.html').exists():
                self.create_default_index()
            
            # Configura handler personalizado para log
            class CustomHandler(http.server.SimpleHTTPRequestHandler):
                def log_message(self, format, *args):
                    logging.info("%s - - [%s] %s\n" % (
                        self.client_address[0],
                        self.log_date_time_string(),
                        format % args
                    ))
                
                def end_headers(self):
                    # Adiciona headers para evitar cache
                    self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                    self.send_header('Pragma', 'no-cache')
                    self.send_header('Expires', '0')
                    super().end_headers()
            
            # Usa servidor padrão mais simples e confiável
            try:
                self.server = FastShutdownTCPServer(("", self.port), CustomHandler)
            except OSError as e:
                self.show_message(f"Porta {self.port} em uso. Tente outra porta ou feche o servidor anterior.")
                logging.error(f"Erro ao bindar porta {self.port}: {str(e)}")
                return
            
            # Inicia servidor em thread daemon
            self.server_thread = threading.Thread(target=self.run_server, daemon=True)
            self.server_thread.start()
            
            self.running = True
            self.update_icon()
            
            # Aguarda um pouco para o servidor inicializar
            time.sleep(0.2)
            #webbrowser.open(f'http://localhost:{self.port}')
            logging.info(f"Servidor iniciado na porta {self.port} em {self.script_dir}")
            
        except Exception as e:
            self.show_message(f"Erro ao iniciar servidor: {str(e)}")
            logging.error(f"Erro ao iniciar servidor: {str(e)}")
    
    def run_server(self):
        """Executa o servidor"""
        try:
            self.server.serve_forever()
        except Exception as e:
            if not self.is_closing:
                logging.error(f"Erro no servidor: {str(e)}")
    
    def stop_server(self):
        """Para o servidor web rapidamente"""
        if not self.running:
            return
            
        try:
            self.running = False
            
            if self.server:
                # Para o servidor imediatamente
                self.server.shutdown()
                self.server.server_close()
                
            # Aguarda thread por no máximo 0.3 segundos
            if self.server_thread and self.server_thread.is_alive():
                self.server_thread.join(timeout=0.3)
            
            self.server = None
            self.server_thread = None
            self.update_icon()
            
            if not self.is_closing:
                self.show_message("Servidor parado!")
            logging.info("Servidor parado")
            
        except Exception as e:
            logging.error(f"Erro ao parar servidor: {str(e)}")
    
    def toggle_server(self):
        """Alterna entre iniciar/parar o servidor"""
        if self.is_closing:
            return
            
        if self.running:
            self.stop_server()
        else:
            self.start_server()
    
    def open_browser(self):
        """Abre o navegador no endereço do servidor"""
        if self.is_closing:
            return
            
        if self.running:
            webbrowser.open(f'http://localhost:{self.port}')
            logging.info("Navegador aberto")
        else:
            self.show_message("Servidor não está rodando!")
            logging.warning("Tentativa de abrir navegador com servidor parado")
    
    def show_message(self, message):
        """Exibe mensagem popup rapidamente"""
        if self.is_closing:
            return
            
        try:
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            root.after(3000, root.destroy)  # Auto-fecha em 3 segundos
            messagebox.showinfo("Servidor Web", message)
            root.destroy()
        except:
            pass
    
    def create_default_index(self):
        """Cria arquivo index.html padrão"""
        html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🚀 Servidor Local Funcionando!</title>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
        }}
        .container {{
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            border: 1px solid rgba(255,255,255,0.2);
        }}
        h1 {{
            text-align: center;
            font-size: 3em;
            margin-bottom: 30px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }}
        .status {{
            background: rgba(46, 204, 113, 0.3);
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            margin: 30px 0;
            border: 2px solid rgba(46, 204, 113, 0.5);
        }}
        .info {{
            background: rgba(52, 152, 219, 0.2);
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            border: 1px solid rgba(52, 152, 219, 0.3);
        }}
        .success {{
            color: #2ecc71;
            font-weight: bold;
            font-size: 1.2em;
        }}
        code {{
            background: rgba(0,0,0,0.3);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Servidor Funcionando!</h1>
        
        <div class="status">
            <h2 class="success">✅ STATUS: ONLINE</h2>
            <p><strong>📡 Porta:</strong> {self.port}</p>
            <p><strong>🌐 URL:</strong> <code>http://localhost:{self.port}</code></p>
            <p><strong>📁 Pasta:</strong> <code>{self.script_dir.name}</code></p>
        </div>
        
        <div class="info">
            <h3>📋 Como usar este servidor</h3>
            <p>• <strong>Substitua</strong> este arquivo <code>index.html</code> pelo seu próprio</p>
            <p>• <strong>Adicione</strong> arquivos CSS, JavaScript, imagens na mesma pasta</p>
            <p>• <strong>Acesse</strong> outros arquivos: <code>http://localhost:{self.port}/arquivo.html</code></p>
            <p>• <strong>Gerencie</strong> o servidor pelo ícone na bandeja do sistema</p>
        </div>
        
        <div class="info">
            <h3>🎯 Exemplos de uso</h3>
            <p>• Desenvolvimento web local</p>
            <p>• Teste de sites estáticos</p>
            <p>• Compartilhamento de arquivos na rede local</p>
            <p>• Prototipagem rápida</p>
        </div>
        
        <p style="text-align: center; margin-top: 40px; opacity: 0.7;">
            <small>🐍 Servidor Python • Pasta: {self.script_dir}</small>
        </p>
    </div>
</body>
</html>"""
        
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(html_content)
        logging.info("Arquivo index.html padrão criado")
    
    def update_icon(self):
        """Atualiza ícone do system tray"""
        try:
            if self.icon and not self.is_closing:
                color = "green" if self.running else "red"
                self.icon.icon = self.create_image(color)
        except:
            pass
    
    def force_cleanup(self):
        """Força limpeza de recursos"""
        try:
            self.is_closing = True
            if self.running and self.server:
                self.server.shutdown()
                self.server.server_close()
        except:
            pass
    
    def quit_app(self):
        """Encerra a aplicação rapidamente - Método 2: OS Exit"""
        self.stop_server()
        os._exit(0)
    
    def run(self):
        """Inicia aplicação no system tray"""
        try:
            menu = (
                item('🟢 Iniciar/Parar Servidor', self.toggle_server, default=True),
                item('🌐 Abrir no Navegador', self.open_browser),
                pystray.Menu.SEPARATOR,
                item(f'📁 Pasta: {self.script_dir.name}', lambda: None, enabled=False),
                item(f'📡 Porta: {self.port}', lambda: None, enabled=False),
                pystray.Menu.SEPARATOR,
                item('❌ Sair', self.quit_app)
            )
            
            self.icon = pystray.Icon(
                self.icon_name,
                self.create_image("red"),
                f"🚀 Servidor Web Local - Porta {self.port}",
                menu
            )
            
            # Inicia servidor automaticamente
            self.start_server()
            
            # Executa o ícone do tray
            self.icon.run()
            
        except Exception as e:
            try:
                logging.error(f"Erro ao iniciar aplicação: {str(e)}")
                if not self.is_closing:
                    root = tk.Tk()
                    root.withdraw()
                    messagebox.showerror("Erro", f"Erro ao iniciar:\n{e}")
                    root.destroy()
            except:
                pass
            finally:
                os._exit(1)

if __name__ == "__main__":
    try:
        app = WebServerTray()
        app.run()
    except Exception as e:
        try:
            logging.error(f"Erro crítico na inicialização: {str(e)}")
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror("Erro Fatal", f"Erro crítico:\n{e}")
            root.destroy()
        except:
            pass
        finally:
            os._exit(1)