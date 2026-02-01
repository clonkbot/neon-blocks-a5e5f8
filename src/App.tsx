import { useState, useEffect, useCallback, useRef } from 'react'

// Tetromino shapes
const TETROMINOES = {
  I: { shape: [[1, 1, 1, 1]], color: 'cyan' },
  O: { shape: [[1, 1], [1, 1]], color: 'yellow' },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: 'purple' },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: 'green' },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: 'red' },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: 'blue' },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: 'orange' },
}

type TetrominoKey = keyof typeof TETROMINOES

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20
const CELL_SIZE = 24

type Cell = string | null
type Board = Cell[][]

interface Piece {
  shape: number[][]
  color: string
  x: number
  y: number
}

const createEmptyBoard = (): Board =>
  Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null))

const randomTetromino = (): TetrominoKey => {
  const keys = Object.keys(TETROMINOES) as TetrominoKey[]
  return keys[Math.floor(Math.random() * keys.length)]
}

const rotate = (matrix: number[][]): number[][] => {
  const rows = matrix.length
  const cols = matrix[0].length
  const rotated: number[][] = []
  for (let i = 0; i < cols; i++) {
    rotated[i] = []
    for (let j = rows - 1; j >= 0; j--) {
      rotated[i].push(matrix[j][i])
    }
  }
  return rotated
}

function App() {
  const [board, setBoard] = useState<Board>(createEmptyBoard())
  const [currentPiece, setCurrentPiece] = useState<Piece | null>(null)
  const [nextPiece, setNextPiece] = useState<TetrominoKey>(randomTetromino())
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lines, setLines] = useState(0)
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle')
  const gameLoopRef = useRef<number | null>(null)
  const lastDropRef = useRef<number>(0)

  const spawnPiece = useCallback(() => {
    const type = nextPiece
    const tetromino = TETROMINOES[type]
    const newPiece: Piece = {
      shape: tetromino.shape,
      color: tetromino.color,
      x: Math.floor(BOARD_WIDTH / 2) - Math.floor(tetromino.shape[0].length / 2),
      y: 0,
    }
    setNextPiece(randomTetromino())
    return newPiece
  }, [nextPiece])

  const isValidMove = useCallback((piece: Piece, boardState: Board): boolean => {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const newX = piece.x + x
          const newY = piece.y + y
          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
            return false
          }
          if (newY >= 0 && boardState[newY][newX]) {
            return false
          }
        }
      }
    }
    return true
  }, [])

  const mergePiece = useCallback((piece: Piece, boardState: Board): Board => {
    const newBoard = boardState.map(row => [...row])
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const boardY = piece.y + y
          const boardX = piece.x + x
          if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
            newBoard[boardY][boardX] = piece.color
          }
        }
      }
    }
    return newBoard
  }, [])

  const clearLines = useCallback((boardState: Board): { newBoard: Board; cleared: number } => {
    const newBoard = boardState.filter(row => row.some(cell => cell === null))
    const cleared = BOARD_HEIGHT - newBoard.length
    while (newBoard.length < BOARD_HEIGHT) {
      newBoard.unshift(Array(BOARD_WIDTH).fill(null))
    }
    return { newBoard, cleared }
  }, [])

  const lockPiece = useCallback(() => {
    if (!currentPiece) return

    const mergedBoard = mergePiece(currentPiece, board)
    const { newBoard, cleared } = clearLines(mergedBoard)

    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800][cleared] * level
      setScore(prev => prev + points)
      setLines(prev => {
        const newLines = prev + cleared
        const newLevel = Math.floor(newLines / 10) + 1
        if (newLevel !== level) {
          setLevel(newLevel)
        }
        return newLines
      })
    }

    setBoard(newBoard)

    const newPiece = spawnPiece()
    if (!isValidMove(newPiece, newBoard)) {
      setGameState('gameover')
      setCurrentPiece(null)
    } else {
      setCurrentPiece(newPiece)
    }
  }, [currentPiece, board, level, mergePiece, clearLines, spawnPiece, isValidMove])

  const movePiece = useCallback((dx: number, dy: number) => {
    if (!currentPiece || gameState !== 'playing') return

    const movedPiece = { ...currentPiece, x: currentPiece.x + dx, y: currentPiece.y + dy }

    if (isValidMove(movedPiece, board)) {
      setCurrentPiece(movedPiece)
      return true
    } else if (dy > 0) {
      lockPiece()
    }
    return false
  }, [currentPiece, board, gameState, isValidMove, lockPiece])

  const rotatePiece = useCallback(() => {
    if (!currentPiece || gameState !== 'playing') return

    const rotatedShape = rotate(currentPiece.shape)
    const rotatedPiece = { ...currentPiece, shape: rotatedShape }

    // Wall kick: try original position, then left, then right
    const kicks = [0, -1, 1, -2, 2]
    for (const kick of kicks) {
      const kickedPiece = { ...rotatedPiece, x: rotatedPiece.x + kick }
      if (isValidMove(kickedPiece, board)) {
        setCurrentPiece(kickedPiece)
        return
      }
    }
  }, [currentPiece, board, gameState, isValidMove])

  const hardDrop = useCallback(() => {
    if (!currentPiece || gameState !== 'playing') return

    let dropDistance = 0
    let droppedPiece = { ...currentPiece }

    while (isValidMove({ ...droppedPiece, y: droppedPiece.y + 1 }, board)) {
      droppedPiece.y++
      dropDistance++
    }

    setScore(prev => prev + dropDistance * 2)
    setCurrentPiece(droppedPiece)

    // Lock immediately after hard drop
    setTimeout(() => {
      const mergedBoard = mergePiece(droppedPiece, board)
      const { newBoard, cleared } = clearLines(mergedBoard)

      if (cleared > 0) {
        const points = [0, 100, 300, 500, 800][cleared] * level
        setScore(prev => prev + points)
        setLines(prev => {
          const newLines = prev + cleared
          const newLevel = Math.floor(newLines / 10) + 1
          if (newLevel !== level) {
            setLevel(newLevel)
          }
          return newLines
        })
      }

      setBoard(newBoard)

      const newPiece = spawnPiece()
      if (!isValidMove(newPiece, newBoard)) {
        setGameState('gameover')
        setCurrentPiece(null)
      } else {
        setCurrentPiece(newPiece)
      }
    }, 0)
  }, [currentPiece, board, gameState, level, isValidMove, mergePiece, clearLines, spawnPiece])

  const startGame = useCallback(() => {
    setBoard(createEmptyBoard())
    setScore(0)
    setLevel(1)
    setLines(0)
    setNextPiece(randomTetromino())
    setGameState('playing')

    const type = randomTetromino()
    const tetromino = TETROMINOES[type]
    setCurrentPiece({
      shape: tetromino.shape,
      color: tetromino.color,
      x: Math.floor(BOARD_WIDTH / 2) - Math.floor(tetromino.shape[0].length / 2),
      y: 0,
    })
  }, [])

  const togglePause = useCallback(() => {
    if (gameState === 'playing') {
      setGameState('paused')
    } else if (gameState === 'paused') {
      setGameState('playing')
    }
  }, [gameState])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'idle' || gameState === 'gameover') {
        if (e.key === 'Enter') {
          startGame()
        }
        return
      }

      if (e.key === 'p' || e.key === 'P') {
        togglePause()
        return
      }

      if (gameState !== 'playing') return

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          movePiece(-1, 0)
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          movePiece(1, 0)
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          movePiece(0, 1)
          setScore(prev => prev + 1)
          break
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          rotatePiece()
          break
        case ' ':
          e.preventDefault()
          hardDrop()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, movePiece, rotatePiece, hardDrop, startGame, togglePause])

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
        gameLoopRef.current = null
      }
      return
    }

    const dropInterval = Math.max(100, 1000 - (level - 1) * 100)

    const gameLoop = (timestamp: number) => {
      if (timestamp - lastDropRef.current >= dropInterval) {
        movePiece(0, 1)
        lastDropRef.current = timestamp
      }
      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
      }
    }
  }, [gameState, level, movePiece])

  // Render the board with the current piece
  const renderBoard = () => {
    const displayBoard = board.map(row => [...row])

    // Add ghost piece
    if (currentPiece && gameState === 'playing') {
      let ghostY = currentPiece.y
      while (isValidMove({ ...currentPiece, y: ghostY + 1 }, board)) {
        ghostY++
      }

      // Draw ghost
      for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
          if (currentPiece.shape[y][x]) {
            const boardY = ghostY + y
            const boardX = currentPiece.x + x
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              if (!displayBoard[boardY][boardX]) {
                displayBoard[boardY][boardX] = `ghost-${currentPiece.color}`
              }
            }
          }
        }
      }

      // Draw current piece
      for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
          if (currentPiece.shape[y][x]) {
            const boardY = currentPiece.y + y
            const boardX = currentPiece.x + x
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              displayBoard[boardY][boardX] = currentPiece.color
            }
          }
        }
      }
    }

    return displayBoard
  }

  const getBlockClass = (cell: Cell) => {
    if (!cell) return 'bg-gray-900/50'
    if (cell.startsWith('ghost-')) {
      const color = cell.replace('ghost-', '')
      return `border border-${color === 'cyan' ? '[#00ffff]' : color === 'yellow' ? '[#ffff00]' : color === 'purple' ? '[#9400d3]' : color === 'green' ? '[#00ff00]' : color === 'red' ? '[#ff4444]' : color === 'blue' ? '[#4444ff]' : '[#ff8c00]'} opacity-30`
    }
    return `block-${cell}`
  }

  const renderNextPiece = () => {
    const tetromino = TETROMINOES[nextPiece]
    return (
      <div className="flex flex-col items-center justify-center h-20">
        {tetromino.shape.map((row, y) => (
          <div key={y} className="flex">
            {row.map((cell, x) => (
              <div
                key={x}
                className={`w-5 h-5 ${cell ? `block-${tetromino.color}` : ''}`}
                style={{ margin: '1px' }}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const renderShapePreview = () => {
    const colors = ['cyan', 'purple', 'yellow', 'green', 'red', 'blue', 'orange']

    return (
      <div className="grid grid-cols-4 gap-2">
        {colors.slice(0, 8).map((color, i) => (
          <div
            key={i}
            className={`w-8 h-8 rounded block-${color}`}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen grid-bg flex flex-col items-center justify-center p-4 relative scanlines">
      {/* Title */}
      <h1 className="font-orbitron text-4xl md:text-5xl lg:text-6xl font-black neon-cyan mb-8 tracking-wider animate-flicker">
        NEON BLOCKS
      </h1>

      {/* Game Container */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-center lg:items-start">
        {/* Left Panel - Score & Next */}
        <div className="flex flex-row lg:flex-col gap-4 order-2 lg:order-1">
          {/* Score Panel */}
          <div className="neon-border-cyan rounded-lg p-4 bg-black/80 min-w-[140px]">
            <div className="text-cyan-400 font-tech text-sm mb-1 tracking-widest">SCORE</div>
            <div className="text-yellow-400 font-orbitron text-2xl font-bold tracking-wider">
              {score.toString().padStart(6, '0')}
            </div>

            <div className="text-cyan-400 font-tech text-sm mt-3 tracking-widest">LEVEL</div>
            <div className="text-pink-500 font-orbitron text-2xl font-bold">{level}</div>

            <div className="text-cyan-400 font-tech text-sm mt-3 tracking-widest">LINES</div>
            <div className="text-yellow-400 font-orbitron text-2xl font-bold">{lines}</div>
          </div>

          {/* Next Piece */}
          <div className="neon-border-cyan rounded-lg p-4 bg-black/80 min-w-[140px]">
            <div className="text-cyan-400 font-tech text-sm mb-2 tracking-widest">NEXT</div>
            {renderNextPiece()}
          </div>
        </div>

        {/* Game Board */}
        <div className="neon-border-pink rounded-lg p-2 bg-black/90 relative order-1 lg:order-2">
          <div
            className="relative"
            style={{
              width: BOARD_WIDTH * CELL_SIZE + BOARD_WIDTH - 1,
              height: BOARD_HEIGHT * CELL_SIZE + BOARD_HEIGHT - 1,
            }}
          >
            {renderBoard().map((row, y) => (
              <div key={y} className="flex">
                {row.map((cell, x) => (
                  <div
                    key={x}
                    className={`${getBlockClass(cell)} rounded-sm`}
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      margin: '0.5px',
                    }}
                  />
                ))}
              </div>
            ))}

            {/* Overlay for idle/paused/gameover */}
            {gameState !== 'playing' && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
                {gameState === 'idle' && (
                  <>
                    <div className="text-pink-500 font-tech text-center mb-4 px-4">
                      <div className="text-lg">UNIQUE SHAPES</div>
                      <div className="text-lg">INFINITE FUN</div>
                    </div>
                    <button
                      onClick={startGame}
                      className="neon-button font-orbitron px-8 py-3 text-lg tracking-wider"
                    >
                      START GAME
                    </button>
                    <div className="text-gray-500 font-tech text-sm mt-4 tracking-widest">
                      PRESS ENTER
                    </div>
                  </>
                )}
                {gameState === 'paused' && (
                  <>
                    <div className="text-cyan-400 font-orbitron text-3xl mb-4 neon-cyan">
                      PAUSED
                    </div>
                    <button
                      onClick={togglePause}
                      className="neon-button font-orbitron px-8 py-3 text-lg tracking-wider"
                    >
                      RESUME
                    </button>
                  </>
                )}
                {gameState === 'gameover' && (
                  <>
                    <div className="text-red-500 font-orbitron text-3xl mb-2" style={{ textShadow: '0 0 10px #ff0000, 0 0 20px #ff0000' }}>
                      GAME OVER
                    </div>
                    <div className="text-yellow-400 font-tech text-xl mb-4">
                      SCORE: {score}
                    </div>
                    <button
                      onClick={startGame}
                      className="neon-button font-orbitron px-8 py-3 text-lg tracking-wider"
                    >
                      PLAY AGAIN
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Controls & Shapes */}
        <div className="flex flex-row lg:flex-col gap-4 order-3">
          {/* Controls */}
          <div className="neon-border-yellow rounded-lg p-4 bg-black/80">
            <div className="text-yellow-400 font-tech text-sm mb-3 tracking-widest">CONTROLS</div>
            <div className="space-y-2 text-sm font-tech">
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">←→ / AD</span>
                <span className="text-white">Move</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">↑ / W</span>
                <span className="text-white">Rotate</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">↓ / S</span>
                <span className="text-white">Soft Drop</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">SPACE</span>
                <span className="text-white">Hard Drop</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">P</span>
                <span className="text-white">Pause</span>
              </div>
            </div>
          </div>

          {/* Shapes Preview */}
          <div className="neon-border-cyan rounded-lg p-4 bg-black/80">
            <div className="text-cyan-400 font-tech text-sm mb-3 tracking-widest">SHAPES</div>
            {renderShapePreview()}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-gray-600 text-xs font-tech tracking-wide">
        Requested by @JolupCCTV · Built by @clonkbot
      </footer>
    </div>
  )
}

export default App