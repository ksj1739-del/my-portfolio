// React 18 + htm(JSX 대체 템플릿). 빌드 없이 import map으로 불러온다(index.html).
import React from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';

export const html = htm.bind(React.createElement);
export const { useState, useEffect, useMemo, useRef, useCallback, Fragment } = React;
export { React, createRoot };
