// 아주 작은 이벤트 버스 — 화면 모듈끼리 직접 import 하지 않고 상태 변화만 구독한다.
export function createEmitter() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
    emit(type, payload) {
      (handlers.get(type) || []).forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error(`[timetable] handler error for "${type}"`, e);
        }
      });
    },
  };
}
