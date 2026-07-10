// ═══════════════════════════════════════════════════════════════════════
// src/hooks/useSOSListener.js
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';

export function useSOSListener(db) {
  const [sosNodes, setSosNodes] = useState([]);

  useEffect(() => {
    const nodesRef = ref(db, 'weather_nodes');
    return onValue(nodesRef, (snap) => {
      const data = snap.val() || {};
      const active = Object.entries(data)
        .filter(([, node]) => node.active_sos)
        .map(([nodeId, node]) => ({ nodeId, ...node }));
      setSosNodes(active);
    });
  }, [db]);

  const dismissSOS = (nodeId) => {
    setSosNodes(prev => prev.filter(n => n.nodeId !== nodeId));
  };

  return { sosNodes, dismissSOS };
}