# Neon Survivor 🚀

Um jogo arcade 2D de sobrevivência, criado como **protótipo independente de portfólio** com React, TypeScript, PixiJS 8 e Vite. O projeto não é afiliado à Jungle Gaming.

O cenário ocupa toda a janela do navegador. Durante a partida, o HUD mostra apenas corações no canto superior esquerdo, pontuação no centro e onda no canto superior direito, junto do botão de pausa. Início, instruções, pausa e Game Over aparecem sobre o próprio cenário. O Game Over mostra apenas título, score final e botão para jogar novamente. O recorde local continua salvo internamente, sem aparecer na interface.

## Versão online

Repositório do código: [NicolasSF2006/neon-survivor](https://github.com/NicolasSF2006/neon-survivor).

A publicação pública ainda está pendente. A URL real será adicionada aqui depois da autorização e da validação do deploy.

## Funcionalidades

- Combate com mira de 360°, disparos direcionais e ondas de meteoros.
- Movimento independente da mira por teclado ou dois joysticks de toque.
- Pixel art procedural, propulsor que responde ao movimento e três camadas de estrelas em paralaxe.
- HUD responsivo, pausa, Game Over, reinício e recorde local.
- Testes automatizados da engine, controles, matemática, viewport e recursos gráficos.

## Como jogar

- **WASD / setas:** movimentam a nave independentemente da mira, com diagonais normalizadas.
- **Mouse:** mira em 360°. O botão esquerdo dispara; segure para disparar continuamente.
- **Espaço:** também dispara na direção da mira. Mouse e Espaço compartilham o mesmo intervalo de 170 ms entre tiros.
- **P / Esc** ou botão no canto superior direito: pausa e continua.
- **Enter:** inicia/reinicia a partida (também há botões na interface).
- **Celular/tablet com ponteiro de toque:** joystick esquerdo move a nave; joystick direito mira e dispara automaticamente fora da zona morta. Solte o direito para parar de atirar, preservando a última direção.
- Ao perder o foco ou ocultar a aba, o jogo pausa e limpa os controles pressionados. Retome pelo botão **Continuar**, P ou Esc.
- Cada inimigo destruído vale **100 pontos**.
- Perde-se **uma vida somente na colisão direta** com um meteoro, respeitando a invulnerabilidade temporária. Meteoros que saem completamente do cenário são removidos sem perder vidas ou pontos.
- A partida termina quando as **3 vidas** acabam.
- A onda/dificuldade aumenta a cada **20 segundos**.
- O maior placar fica salvo em **localStorage**.

## Rodar localmente

**Ambiente validado:** Node.js 24.x e npm. Os testes usam a remoção nativa de tipos TypeScript do Node. Na Vercel, selecione Node.js 24.x nas configurações do projeto para reproduzir esse ambiente.

```bash
npm install
npm run dev
```

Abra o endereço informado pelo Vite (em geral `http://localhost:5173`).

## Produção e testes

```bash
npm run build    # checagem TypeScript e build Vite
npm run preview  # visualiza a versão de produção
npx tsc --noEmit # checagem TypeScript isolada
npm test         # testes de matemática, viewport, joysticks e engine (Node 22.18+ ou 24+)
```

## Stack e arquitetura

- **React**: UI, placar, controles virtuais, telas de início, pausa e fim.
- **TypeScript**: tipos explícitos para estado, entidades e controles.
- **PixiJS 8**: renderização WebGL (pixel art procedural com Graphics), cena e ticker.
- **PixelArt**: mapas de pixels e geometria compartilhada para nave, meteoros, tiros, estrelas e partículas.
- **Starfield**: três camadas decorativas de estrelas, independentes da simulação da partida.
- **GameEngine**: lógica e ciclo de vida da partida, movimento, inimigos, colisão circular e partículas.
- **GameCanvas**: ponte entre a aplicação React e o PixiJS; instancia a engine no `useEffect`, com limpeza adequada.
- **math.ts**: funções puras testáveis (`clamp`, `circlesOverlap`, `normalizedDirection`).
- **LocalStorage**: persistência local do recorde, sem backend.

O movimento usa `deltaMS / 1000` para medir tempo em segundos, com um limite de 50 ms por atualização para evitar grandes saltos após travamentos temporários. Diagonais são normalizadas para não haver vantagem de velocidade.

### Visual pixel art

Os elementos do cenário são construídos em código com pequenos mapas de pixels. `PixelArt.ts` transforma trechos contíguos de mesma cor em retângulos e mantém `GraphicsContext` compartilhados por instância da engine. Não há imagens externas, spritesheets, texturas rasterizadas ou filtros de blur. A nave usa ciano/azul, detalhes roxos e magenta, highlights claros e um propulsor pixelado independente. Meteoros têm três variações de silhueta, crateras e paleta; os projéteis têm núcleo claro e rastro curto em blocos. Estrelas e fragmentos são pequenos quadrados/cruzes, sem grade no fundo.

O antialias do canvas é desativado, os gráficos usam `roundPixels` e apenas o canvas recebe `image-rendering: pixelated`. Posições e colisões continuam usando coordenadas contínuas, com os mesmos raios, velocidades, intervalos, pontuação e rotação livre. A animação do propulsor troca entre quatro contextos pequenos já criados; o corpo da nave usa um único contexto fixo. A geometria é agrupada em batches e liberada na desmontagem, inclusive quando a inicialização termina depois do componente ser desmontado.

Nave e meteoros usam escala visual de `1,25×` na criação dos gráficos, reutilizando os mesmos mapas e geometrias. Os hitboxes permanecem iguais (raio 17 da nave e raio lógico original de cada meteoro). Para acomodar a apresentação maior, a nave respeita uma margem visual de 30 unidades nas bordas, os tiros nascem 35 unidades à frente do pivô e os meteoros são descartados somente depois de sair com o tamanho visual ampliado. Tiros, estrelas e partículas mantêm o tamanho anterior.

HUD, textos, botões, menus, overlays e joysticks continuam com a interface moderna anterior; a pixelização é restrita ao canvas. Em escalas e ângulos fracionários, as bordas têm o serrilhado próprio do estilo, sem restringir a mira de 360° ou a responsividade.

### Propulsor dinâmico

O corpo e a chama são gráficos irmãos dentro do mesmo contêiner da nave, compartilhando escala e rotação de 360°. O propulsor usa quatro geometrias pixeladas pré-criadas em ciano, azul e roxo, sem filtros nem escala variável. Parada, a nave mantém uma chama curta com pulsação de brilho a 1,5 Hz. O deslocamento real aumenta o tamanho e a intensidade da chama, inclusive proporcionalmente ao joystick analógico; disparar ou manter uma direção contra a borda não aumenta o propulsor.

A intensidade usa interpolação exponencial por delta time: resposta de entrada de 12/s e retorno de 7/s, sem alterar a movimentação física. O brilho varia continuamente e a silhueta avança em passos de pixels inteiros. A chama começa no escape em y=16 e termina até y=24, respeitando a margem visual existente da nave. Pausa e Game Over congelam a animação; reiniciar restaura o repouso. Nenhum objeto ou contexto gráfico é criado por frame, e os contextos são liberados com `PixelArt`.

### Paralaxe das estrelas

O fundo escuro mantém três camadas de estrelas pixeladas: distantes com um pixel, brilho baixo e velocidade de cerca de 6 unidades/s; intermediárias com dois pixels e 14 unidades/s; próximas com pequenas cruzes e 28 unidades/s. Posições, brilho e velocidades variam dentro de cada camada para evitar alinhamentos repetitivos. A deriva diagonal usa delta time e recicla as posições somente depois das bordas, sem criar gráficos, sortear novas posições ou alterar a câmera e as coordenadas da partida a cada frame.

São 70 gráficos fixos que reutilizam os três contextos de estrelas existentes. Quando o menor lado da viewport é de até 600 px, apenas 40 ficam visíveis e a deriva cai para 75% da velocidade. Redimensionar remapeia as posições e alterna a visibilidade do mesmo conjunto, sem recriar recursos. As estrelas continuam congeladas durante pausa e Game Over; não há grade, nebulosas, blur ou novas dependências. A desmontagem libera as camadas com a cena e os contextos com `PixelArt`.

### Feedback de combate

`CombatEffects.ts` concentra o polimento visual: projéteis com rastro curto integrado ao mapa de pixels, flash de boca de disparo de 70 ms, impacto de 120 ms e burst de destruição de 220 ms acompanhado de pequenas faíscas e dos fragmentos existentes. O dano acrescenta uma tonalidade breve no corpo da nave e um burst discreto, preservando a piscada e os 1,5 segundos de invulnerabilidade. Meteoros deixam poeira curta atrás dos atores. O início e a troca de ondas exibem uma legenda pixelada por 1,15 segundo, abaixo do HUD, sem interromper a partida.

As geometrias de flashes e letras são compartilhadas. Os novos efeitos reutilizam 80 gráficos pré-alocados, com orçamento de 40 ativos em telas pequenas e capacidade reservada para feedback de combate separada da poeira. O sorteio visual é independente do `Math.random` usado pelo jogo. A animação usa delta time, congela em pausa/Game Over e é limpa ao reiniciar; o resize remapeia somente as posições visuais. A geometria e os objetos do pool são liberados junto com a cena. Não há filtros de blur, listeners ou timers adicionais, nem dependências novas.

### Mira, disparos e joysticks

A engine converte a posição do cursor de coordenadas CSS para coordenadas do mundo usando o retângulo atual do canvas, as dimensões lógicas do renderer e a escala do mundo. Isso também considera o arredondamento do buffer pelo DPR. O ângulo é `atan2(alvoY - naveY, alvoX - naveX)`; a rotação visual adiciona `π/2`, pois o desenho original aponta para cima. Se o cursor coincide com o centro da nave, a direção anterior é mantida. A mira é recalculada depois da movimentação, inclusive com o cursor parado.

Cada projétil nasce 35 unidades à frente da nave e guarda `vx = cos(ângulo) × 625` e `vy = sin(ângulo) × 625`. O loop atualiza ambos os eixos com delta time. Girar a nave não modifica a velocidade de tiros existentes. Projéteis são removidos ao sair por qualquer borda; colisões continuam circulares e cada meteoro destruído continua valendo 100 pontos. Cliques breves também disparam, sem duplicar o cooldown quando Espaço está pressionado.

`VirtualJoystick` usa uma instância independente de `JoystickInput` por controle, com um único `pointerId` capturado. Há uma zona morta radial de 18% e intensidade proporcional fora dela. Dois dedos podem mover e mirar simultaneamente sem trocar de controle. O indicador é atualizado por estilo DOM e os vetores seguem diretamente para a engine, sem `setState` por movimento. Os controles aparecem em dispositivos com ponteiro principal de toque e ao usar toque em dispositivos híbridos; mouse e teclado retomam os controles convencionais. Soltura, cancelamento, perda de captura, foco ou orientação liberam as entradas.

Ondas continuam avançando a cada 20 segundos de jogo. A remoção de meteoros fora da área apenas os retira da lista de entidades; não aplica dano, efeito de colisão ou penalidade e não interfere no cronômetro das ondas. Meteoros parcialmente visíveis continuam participando das colisões, inclusive perto das bordas.

### Resoluções e ciclo de vida

- O layout usa `100dvh`, com fallback para `100vh`, sem margens nem rolagem da página e sem depender da Fullscreen API. HUD e controles respeitam as safe areas do dispositivo.
- Um `ResizeObserver` acompanha o contêiner do canvas. Eventos são agrupados com `requestAnimationFrame`; o renderer é redimensionado sem recriar a aplicação PixiJS ou reiniciar a partida. Mudanças de orientação seguem o mesmo caminho.
- `viewport.ts` calcula um mundo com dimensões variáveis e escala uniforme: `min(1, largura / 600, altura / 400)`. Isso mantém os sprites proporcionais em telas pequenas, sem barras externas ou corte do cenário. Telas maiores revelam uma área jogável maior.
- Nave, inimigos, tiros e partículas usam as mesmas coordenadas lógicas, inclusive nas colisões. Ao redimensionar, as posições são remapeadas proporcionalmente para o novo mundo; a nave permanece dentro dos limites. Raios, velocidades, pontuação e dificuldade da onda são preservados.
- O DPR é limitado a 2 e o buffer de renderização a aproximadamente 4 milhões de pixels. O tamanho CSS continua preenchendo o contêiner, inclusive quando o Pixi arredonda as dimensões do buffer.
- Pausa e Game Over interrompem a simulação inteira, incluindo estrelas, partículas, cooldowns e cronômetros. O ticker continua registrado; a retomada preserva a partida. No menu inicial, as estrelas continuam em movimento.
- Entradas de teclado, mouse e joysticks são limpas ao pausar, perder foco, ocultar a aba, terminar ou reiniciar. Toques usam captura de ponteiro e tratam soltura, cancelamento e perda de captura. Listeners, observador, resize pendente e recursos gráficos são liberados na desmontagem, inclusive com a montagem assíncrona do React StrictMode.

### Comunicação entre HUD e jogo

A engine mantém as posições e a simulação fora do React. `GameCanvas` entrega snapshots imutáveis por callback e registra os comandos de início, pausa e controles. O HUD lê `lives`, `score` e `wave`; os menus também usam `phase` e `score`. O recorde `best` permanece interno.

Os snapshots são publicados imediatamente em eventos relevantes (pontuação, vida, onda, pausa e fim) e verificados aproximadamente a cada 150 ms para atualizar o tempo interno. Snapshots idênticos são descartados. Não há atualização de posição via `setState` a cada frame. A chave existente `neon-survivor-best-v1` do localStorage é preservada.

## Estrutura

```text
src/
  App.tsx                   Interface React / HUD e controles
  components/GameCanvas.tsx Montagem e desmontagem do PixiJS
  components/VirtualJoystick.tsx Controles analógicos de toque
  game/GameEngine.ts        Renderização e lógica do jogo
  game/PixelArt.ts          Mapas de pixels, geometria compartilhada e animação visual
  game/CombatEffects.ts     Feedback visual de combate, rastros e avisos de ondas
  game/math.ts              Matemática e colisões
  game/JoystickInput.ts     Ponteiro proprietário, zona morta e vetores analógicos
  game/viewport.ts          Dimensões lógicas, escala uniforme e limite de DPR
  game/types.ts             Tipos e constantes
  styles.css                Layout responsivo
  main.tsx                  Entrada da aplicação
tests/math.test.mjs         Testes de matemática
tests/viewport.test.mjs     Resoluções, proporção e orçamento de pixels
tests/engine.test.mjs       Resize/colisões, pausa, input, Game Over e snapshots
tests/joystick.test.mjs     Dois ponteiros, zona morta, isolamento e liberação
tests/pixel-art.test.mjs    Reuso de geometria, pivô estável e liberação de recursos
tests/starfield.test.mjs    Camadas, delta time, reciclagem e ciclo de vida das estrelas
tests/combat-effects.test.mjs Pool, delta time, orçamento mobile, avisos e limpeza dos efeitos
vercel.json                Framework, instalação, build e saída para a Vercel
docs/ARQUITETURA.md         Explicação para entrevista
docs/PUBLICACAO.md          Preparação, autenticação e validação da publicação
```

## Publicação no GitHub e na Vercel

A publicação depende de autorização explícita. O nome sugerido do repositório é `neon-survivor`. A preparação e os passos de autenticação estão em [docs/PUBLICACAO.md](docs/PUBLICACAO.md).

Após criar e validar o repositório na conta correta, importe-o pela integração oficial GitHub + Vercel, usando a branch `main` como produção. O arquivo `vercel.json` registra:

| Configuração | Valor |
| --- | --- |
| Framework | Vite |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

O jogo usa uma única página, sem roteador ou rotas por URL; não precisa de rewrites para funcionar na raiz do domínio. A configuração Vite existente com `base: './'` foi preservada. Não são necessárias variáveis de ambiente, credenciais, banco de dados ou backend para executar o jogo. O recorde fica somente no navegador; as fontes Google Fonts usam fallback local.

Depois de obter a URL pública, valide carregamento, partida, controles, menus, console e correspondência com o commit publicado. Só então substitua o aviso em “Versão online” pelo link real. Commits futuros na branch de produção passarão a disparar builds pela integração da Vercel.

## Escopo e limites honestos

Esta é uma demonstração **single-player, client-side**. Não possui API REST, multiplayer, WebSockets, autenticação, ranking global ou áudio. Os gráficos são criados em código; as fontes Google Fonts têm fallback local. Para jogo comercial seriam necessários testes em dispositivos reais, mais opções de acessibilidade, áudio e melhorias de balanceamento. A área visível varia entre proporções de tela, portanto o tempo de travessia dos inimigos também pode variar; não foi introduzido um novo balanceamento nesta etapa.

## Checklist manual sugerido

1. Inicie a partida por botão e por Enter.
2. Verifique movimentação em WASD, setas e diagonais.
3. Mire com o mouse nas quatro direções, mova-se com WASD independentemente da mira e dispare com clique e Espaço, inclusive simultaneamente. Elimine meteoros e confirme pontos.
4. Teste pausa por P, Esc e botão.
5. Confirme que meteoros saindo da tela não custam vidas. Colida diretamente com meteoros para sofrer dano e terminar a partida.
6. Reinicie e confirme que score/inimigos reiniciaram.
7. Atualize a página e confirme que o recorde local permanece salvo na chave `neon-survivor-best-v1` do localStorage.
8. Teste 1920×1080, 1366×768, 390×844 e 844×390. Redimensione durante a partida e confirme nave acessível, HUD sem sobreposição, ausência de rolagem e colisões funcionando.
9. Em celular, arraste os dois joysticks simultaneamente; solte o direito para parar os tiros, cancele um toque ou troque de aba. Confirme que a nave não permanece em movimento depois de continuar. Verifique retrato e paisagem.
10. Na pausa, confirme que inimigos, estrelas, partículas e ondas ficam parados; no Game Over, o placar deve permanecer fixo.

## Autoria e uso

Protótipo para estudo e demonstração técnica. MIT (veja LICENSE).

O desenvolvimento contou com assistência de IA por meio do Codex, incluindo geração e alteração de código, elaboração e execução de testes, revisão e documentação. As alterações recentes de interface, pixel art procedural, propulsor e paralaxe também tiveram esse apoio. Esta documentação registra esse processo; não atribui ao autor uma implementação manual integral. Os elementos gráficos do jogo são definidos em código.
