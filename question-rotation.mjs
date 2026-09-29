export function createQuestionRotation(items, random = Math.random) {
  if (!Array.isArray(items) || items.length < 3) throw new TypeError('At least three questions are required');
  const unique = new Set(items.map(item => item?.id));
  if (unique.size !== items.length || items.some(item => !item?.id || typeof item.zh !== 'string' || !item.zh.trim() || typeof item.en !== 'string' || !item.en.trim())) {
    throw new TypeError('Question bank must contain unique bilingual questions');
  }

  let bag = [];
  let cursor = 0;
  let lastId = '';

  function refill() {
    bag = [...items];
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
    }
    cursor = 0;
  }

  return {
    next(count) {
      if (!Number.isInteger(count) || count < 1 || count > items.length) throw new RangeError('Invalid question count');
      const selected = [];
      if (cursor >= bag.length) refill();
      const target = Math.min(count, bag.length - cursor);
      while (selected.length < target) {
        const blocked = item => item.id === lastId || selected.some(selectedItem => selectedItem.id === item.id);
        if (blocked(bag[cursor])) {
          const replacementIndex = bag.findIndex((item, index) => index > cursor && !blocked(item));
          if (replacementIndex < 0) break;
          [bag[cursor], bag[replacementIndex]] = [bag[replacementIndex], bag[cursor]];
        }
        selected.push(bag[cursor]);
        cursor += 1;
      }
      if (!selected.length) {
        refill();
        return this.next(count);
      }
      lastId = selected.at(-1).id;
      return selected;
    },
  };
}
