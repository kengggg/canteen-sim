declare const __BUILD_SHA__: string;
declare module '*?worker&inline' {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
declare module '*.css';
