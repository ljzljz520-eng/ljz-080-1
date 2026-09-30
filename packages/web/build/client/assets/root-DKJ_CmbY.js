import{v as m,w as x,x as S,y as f,r as i,_ as w,z as a,j as e,O as j,M as g,A as k,S as M}from"./components-3MROyUOD.js";/**
 * @remix-run/react v2.17.5
 *
 * Copyright (c) Remix Software Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */let l="positions";function v({getKey:t,...c}){let{isSpaMode:u}=m(),o=x(),p=S();f({getKey:t,storageKey:l});let d=i.useMemo(()=>{if(!t)return null;let s=t(o,p);return s!==o.key?s:null},[]);if(u)return null;let h=((s,y)=>{if(!window.history.state||!window.history.state.key){let r=Math.random().toString(32).slice(2);window.history.replaceState({key:r},"")}try{let n=JSON.parse(sessionStorage.getItem(s)||"{}")[y||window.history.state.key];typeof n=="number"&&window.scrollTo(0,n)}catch(r){console.error(r),sessionStorage.removeItem(s)}}).toString();return i.createElement("script",w({},c,{suppressHydrationWarning:!0,dangerouslySetInnerHTML:{__html:`(${h})(${a(JSON.stringify(l))}, ${a(JSON.stringify(d))})`}}))}const N="/assets/app-DJ-iRgpW.css",R=()=>[{rel:"stylesheet",href:N}];function J({children:t}){return e.jsxs("html",{lang:"zh-CN",children:[e.jsxs("head",{children:[e.jsx("meta",{charSet:"utf-8"}),e.jsx("meta",{name:"viewport",content:"width=device-width, initial-scale=1"}),e.jsx(g,{}),e.jsx(k,{})]}),e.jsxs("body",{children:[e.jsx("div",{className:"app",children:t}),e.jsx(v,{}),e.jsx(M,{})]})]})}function L(){return e.jsx(j,{})}export{J as Layout,L as default,R as links};
