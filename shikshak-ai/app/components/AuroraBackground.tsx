
'use client';
import React from "react";

export const AuroraBackground = React.memo(() => {
  return (
    <div className="aurora-wrap">
      <div className="aurora-blob blob-1" />
      <div className="aurora-blob blob-2" />
      <div className="aurora-blob blob-3" />
    </div>
  );
});
