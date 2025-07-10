#!/usr/bin/env python3
import http.server
import socketserver
import json
import subprocess
import os
from urllib.parse import urlparse, parse_qs
import sys
sys.stdout.reconfigure(encoding='utf-8')


class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        # Verifica se é uma requisição para executar Python
        if self.path == '/executar-python':
            try:
                # Lê o corpo da requisição
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                # Decodifica o JSON
                data = json.loads(post_data.decode('utf-8'))
                arquivo_python = data.get('arquivo', 'meu_script.py')
                
                # Verifica se o arquivo existe na mesma pasta
                if not os.path.exists(arquivo_python):
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    response = {'erro': f'Arquivo {arquivo_python} não encontrado'}
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                    return
                
                # Executa o arquivo Python
                resultado = subprocess.run(
                    ['python', arquivo_python], 
                    capture_output=True, 
                    text=True,
                    cwd=os.getcwd()
                )
                
                # Prepara a resposta
                response = {
                    'sucesso': True,
                    'stdout': resultado.stdout,
                    'stderr': resultado.stderr,
                    'codigo_retorno': resultado.returncode
                }
                
                # Envia a resposta
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {'erro': str(e)}
                self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            # Para outras requisições POST, retorna 404
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        # Para lidar com CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == "__main__":
    PORT = 8005
    
    with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print(f"Servidor rodando na porta {PORT}")
        print(f"Acesse: http://localhost:{PORT}")
        httpd.serve_forever()