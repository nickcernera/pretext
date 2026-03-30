// ── Shared word corpus for text sea, rain, and pellets ──────────────────

export const WORD_CORPUS = {
  programming: [
    'async', 'await', 'callback', 'closure', 'recursion',
    'memoize', 'debounce', 'throttle', 'iterator', 'generator',
    'prototype', 'immutable', 'singleton', 'factory', 'middleware',
    'polymorphism', 'abstraction', 'encapsulate', 'refactor', 'monkeypatch',
    'deadlock', 'race_condition', 'garbage_collect', 'type_erasure', 'coercion',
    'currying', 'thunk', 'monad', 'functor', 'contravariant',
    'typecheck', 'lint', 'transpile', 'minify', 'treeshake',
    'polyfill', 'shim', 'hydrate', 'serialize', 'marshal',
    'coroutine', 'fiber', 'greenthread', 'eventloop', 'microtask',
    'proxy', 'reflect', 'symbol', 'weakref', 'finalize',
  ],

  systems: [
    'malloc', 'free', 'fork()', 'exec()', 'pipe',
    'mutex', 'semaphore', 'spinlock', 'futex', 'rwlock',
    'heap', 'stack', 'bss', 'text_segment', 'rodata',
    'syscall', 'segfault', 'core_dump', 'page_fault', 'cache_miss',
    'branch_predict', 'endianness', 'bitshift', 'null_ptr', 'vtable',
    'linker', 'elf', 'mmap', 'epoll', 'kqueue',
    'inode', 'fd', 'ioctl', 'dma', 'interrupt',
    'context_switch', 'scheduler', 'cgroup', 'namespace', 'chroot',
  ],

  ai_ml: [
    'transformer', 'attention', 'gradient', 'softmax', 'backprop',
    'embeddings', 'inference', 'tokenizer', 'dropout', 'entropy',
    'optimizer', 'tensor', 'sigmoid', 'relu', 'epoch',
    'batch', 'checkpoint', 'normalize', 'pooling', 'residual',
    'conv2d', 'learning_rate', 'loss_fn', 'overfit', 'underfit',
    'hallucinate', 'fine_tune', 'rlhf', 'alignment', 'context_window',
    'temperature', 'top_p', 'few_shot', 'chain_of_thought', 'grounding',
    'retrieval', 'distillation', 'quantize', 'lora', 'mixture_of_experts',
    'diffusion', 'autoregressive', 'beam_search', 'kv_cache', 'flash_attn',
    'sparse', 'dense', 'latent_space', 'perplexity', 'logits',
  ],

  networking: [
    'tcp.syn', 'ACK', 'SYN', 'RST', 'FIN',
    'TTL=64', 'udp', 'http/2', 'tls1.3', 'dns',
    'websocket', 'loadbalancer', 'reverse_proxy', 'cdn', 'edge',
    'k8s', 'container', 'ingress', 'cidr', 'nat',
    'iptables', 'keepalive', '502_bad_gw', 'rate_limit', 'circuit_breaker',
    'grpc', 'protobuf', 'quic', 'icmp', 'arp',
    'bgp', 'ospf', 'vlan', 'mtu', 'handshake',
  ],

  crypto: [
    'satoshi', 'mempool', 'utxo', 'nonce', 'merkle_root',
    'proof_of_work', 'halving', 'difficulty', 'genesis_block', '51%_attack',
    'cold_wallet', 'gas_fee', 'smart_contract', 'consensus', 'block_height',
    'hashrate', 'double_spend', 'lightning', 'node_sync', 'orphan_block',
    'sha256', 'secp256k1', 'multisig', 'timelock', 'coinbase_tx',
  ],

  dev_culture: [
    'ship_it', 'lgtm', 'nit:', 'wontfix', 'works_on_my_machine',
    '10x', 'yak_shave', 'bikeshed', 'technical_debt', 'scope_creep',
    'zero_day', 'rubber_duck', 'spaghetti_code', 'cargo_cult', 'premature_optimization',
    'not_a_bug', 'it_depends', 'read_the_docs', 'skill_issue', 'cope',
    'based', 'ratio', 'no_diff', 'touch_grass', 'rage_quit',
    'hotfix', 'rollback', 'canary', 'feature_flag', 'dark_launch',
    'bus_factor', 'code_review', 'pair_prog', 'mob_prog', 'standup',
    'retro', 'sprint', 'backlog', 'blocked', 'unblocked',
    'nerd_snipe', 'xkcd', 'obligatory', 'tl;dr', 'imo',
  ],

  terminal: [
    '0x7fff', 'pid:4847', 'batch_size=32', 'loss=0.003', 'exit(0)',
    'chmod 755', 'sudo !!', 'grep -r', 'tail -f', '>/dev/null',
    'echo $PATH', 'git rebase', 'vim :wq', 'curl -s', 'ssh -i',
    'docker ps', 'cat /proc', 'ls -la', 'kill -9', 'nohup',
    'latency:0.09ms', 'conn.established', '200 OK', '404', '500',
    'stderr', 'stdout', '/dev/urandom', 'crontab -e', 'journalctl',
    'strace', 'ltrace', 'valgrind', 'gdb', 'lldb',
  ],

  math: [
    '∂f/∂x', '∫dx', 'Σ', 'λ', '∞',
    '∈', '∀', '∃', '⊂', '≈',
    '→', '⇒', '∅', 'π', 'φ',
    'O(n log n)', 'P≠NP', 'NP-hard', 'ε→0', '∇f',
    'det(A)', 'eigenvalue', 'fourier', 'convex', 'hessian',
  ],

  algorithms: [
    'btree', 'hashmap', 'trie', 'bloom_filter', 'dag',
    'topological_sort', 'dijkstra', 'dfs', 'bfs', 'quicksort',
    'mergesort', 'binary_search', 'linked_list', 'red_black_tree', 'lru_cache',
    'priority_queue', 'union_find', 'segment_tree', 'fenwick', 'a_star',
    'skip_list', 'radix_sort', 'heap_sort', 'splay_tree', 'avl',
    'consistent_hash', 'cuckoo_filter', 'raft', 'paxos', 'crdt',
  ],

  startup: [
    'mvp', 'pivot', 'ramen_profitable', 'burn_rate', 'product_market_fit',
    'dogfood', 'growth_hack', 'churn', 'arpu', 'dau',
    'north_star_metric', 'series_a', 'cap_table', 'vesting_cliff', 'founder_mode',
    'default_alive', 'rocketship', 'moat', 'flywheel', 'blitzscale',
  ],

  glyphs: [
    // binary fragments
    '0', '1', '00', '01', '10', '11', '000', '001', '010', '011',
    '100', '101', '110', '111', '0000', '0001', '1010', '1111',
    // hex nibbles
    '0x0', '0xF', '0xFF', '0xDEAD', '0xBEEF', '0xCAFE', '0xBABE',
    // single symbols & operators
    '{', '}', '(', ')', '[', ']', '<', '>', '|', '&',
    ';', '::', '=>', '->', '...', '??', '!=', '===', '&&', '||',
    '//', '/*', '*/', '#', '$', '@', '~', '^', '%',
    // compound operators
    '>>>', '<<<', '&&=', '||=', '??=', ':::', '**',
    // block elements
    '█', '▓', '░', '▒', '●', '○', '◆', '◇', '■', '□',
  ],
} as const

/** Every word in the corpus */
export const ALL_WORDS: readonly string[] = Object.values(WORD_CORPUS).flat()

/** Pellet-friendly subset — clean single words, no terminal/aesthetic decorations or glyphs */
export const PELLET_WORDS: readonly string[] = [
  ...WORD_CORPUS.programming,
  ...WORD_CORPUS.ai_ml,
  ...WORD_CORPUS.algorithms,
  ...WORD_CORPUS.crypto,
  ...WORD_CORPUS.dev_culture,
  ...WORD_CORPUS.startup,
]

/**
 * Shuffle-bag pellet word picker — cycles through all words before repeating,
 * eliminating nearby duplicates.
 */
export function createPelletBag(): () => string {
  let bag: string[] = []
  return () => {
    if (bag.length === 0) {
      bag = [...PELLET_WORDS]
      // Fisher-Yates shuffle
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
    }
    return bag.pop()!
  }
}

/** Sea/rain words — full corpus with glyphs weighted 3x for visual texture */
export const SEA_WORDS: readonly string[] = [
  ...ALL_WORDS,
  ...WORD_CORPUS.glyphs,
  ...WORD_CORPUS.glyphs,
]
