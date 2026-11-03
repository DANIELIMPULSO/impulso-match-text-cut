# Impulso Match Text Cut

Gerador de vídeos "text match cut" em português. A palavra destacada fica parada no centro da tela, e as páginas de jornal em volta trocam a cada corte. O vídeo sai em MP4 4K (H.264).

**Site:** https://danielimpulso.github.io/impulso-match-text-cut/

## Como usar
1. Abra o site no Chrome ou no Edge.
2. Digite a **palavra destacada** e o **contexto** (ex.: "produtora de vídeo, filmagens, clientes").
3. Opcional: cole uma chave da API da Anthropic para a IA escrever frases sobre o contexto. A chave não é salva em lugar nenhum: some ao recarregar a página. Sem chave, o site usa o banco de frases embutido.
4. Ajuste layouts, fontes, cores, zoom e som.
5. Clique em **Exportar MP4 4K** e baixe o vídeo.

## Arquivos
- `index.html`: interface
- `app.js`: renderização, zoom, sons e exportação MP4
- `ai.js`: chamada à API da Anthropic direto do navegador
- `frases.js`: banco de frases embutido (pode editar)
- `vendor/mp4-muxer.js`: biblioteca que monta o arquivo MP4
