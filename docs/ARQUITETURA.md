# Guia rápido para apresentar na entrevista

## Resumo (30 segundos)

"O Neon Survivor é um arcade 2D de sobrevivência com React, TypeScript e PixiJS, desenvolvido com assistência de IA pelo Codex. A interface React é separada do loop gráfico PixiJS para evitar renderizações React a cada frame. O jogo tem controles de teclado e toque, mira de 360°, tiros direcionais, meteoros, colisões, ondas, pausa, recorde local, pixel art, propulsor dinâmico e estrelas em paralaxe. Há testes da engine, dos controles, da matemática e dos recursos visuais."

Use essa descrição técnica junto de um relato fiel da sua participação: explique quais decisões tomou, o que revisou e o que foi gerado com assistência. Não apresente o texto como prova de que implementou manualmente todos os recursos.

## Perguntas técnicas comuns

**Por que React e PixiJS separados?** React controla HUD e botões. PixiJS renderiza e movimenta os elementos de jogo continuamente via ticker. Snapshots conectam os dois, em vez de passar a posição a cada frame por `setState`.

**Como se mantém velocidade independente do FPS?** `dt = Math.min(ticker.deltaMS / 1000, 0.05)` e `deslocamento = velocidade * dt`. O `Math.min` limita saltos após travamentos.

**Como se evita acelerar na diagonal?** Normalização de vetor com `Math.hypot(dx, dy)`.

**Como funciona a colisão?** Detecção círculo–círculo via distância ao quadrado, comparada com a soma dos raios ao quadrado. Não depende de raiz quadrada.

**Por que há `destroy()`?** React desmonta componentes; é necessário liberar listeners, ticker, canvas, gráficos e contexto Pixi. O init assíncrono também considera desmontagem durante a inicialização.

**Como a dificuldade cresce?** Uma nova onda a cada 20 segundos aumenta a velocidade e a frequência de inimigos; nas ondas avançadas eles recebem mais vida.

**Qual seria o próximo passo?** API REST para armazenar pontuação remotamente, backend com validação de score, autenticação, testes E2E e WebSockets se uma mecânica multijogador realmente precisar de sincronização em tempo real.

## Não afirme na entrevista

- Que o jogo tem backend ou WebSockets (não tem).
- Que performance foi validada em dispositivos reais sem fazer testes.
- Que você escreveu sozinho o projeto sem ajuda se usou IA. Explique com sinceridade como utilizou IA e quais decisões você consegue explicar e modificar.

## Pontos para inspecionar antes da entrevista

`src/game/GameEngine.ts`: `start`, `tick`, `fire`, `spawnEnemy`, `loseLife`.

`src/game/math.ts`: `normalizedDirection`, `clamp`, `circlesOverlap`.

`src/components/GameCanvas.tsx`: integração React/PixiJS e cleanup.
