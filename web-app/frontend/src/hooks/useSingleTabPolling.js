import { useEffect, useRef, useState } from 'react'

export default function useSingleTabPolling(channelName, onData) {
  const [isLeader, setIsLeader] = useState(false)
  const channelRef = useRef(null)
  const tabIdRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  const onDataRef = useRef(onData)
  const isLeaderRef = useRef(false)
  onDataRef.current = onData

  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel
    let disposed = false
    let leaderSeen = false
    let heartbeatId = null

    const send = (msg) => {
      channel.postMessage({ ...msg, from: tabIdRef.current, at: Date.now() })
    }

    const becomeLeader = () => {
      if (disposed) return
      isLeaderRef.current = true
      setIsLeader(true)
      send({ type: 'leader' })
      if (heartbeatId) clearInterval(heartbeatId)
      heartbeatId = setInterval(() => send({ type: 'leader' }), 10000)
    }

    const yieldLeader = () => {
      isLeaderRef.current = false
      setIsLeader(false)
      if (heartbeatId) {
        clearInterval(heartbeatId)
        heartbeatId = null
      }
    }

    channel.onmessage = (e) => {
      const data = e.data || {}
      if (!data.type || data.from === tabIdRef.current) return

      if (data.type === 'claim') {
        if (isLeaderRef.current) send({ type: 'leader' })
        return
      }
      if (data.type === 'leader') {
        leaderSeen = true
        yieldLeader()
        return
      }
      if (data.type === 'data' && typeof onDataRef.current === 'function') {
        onDataRef.current(data.payload)
      }
    }

    send({ type: 'claim' })
    const claimTimeout = setTimeout(() => {
      if (!leaderSeen) becomeLeader()
    }, 400)

    return () => {
      disposed = true
      clearTimeout(claimTimeout)
      if (heartbeatId) clearInterval(heartbeatId)
      channel.close()
      channelRef.current = null
    }
  }, [channelName])

  const broadcastData = (payload) => {
    if (!channelRef.current) return
    channelRef.current.postMessage({
      type: 'data',
      payload,
      from: tabIdRef.current,
      at: Date.now(),
    })
  }

  return { isLeader, broadcastData }
}
