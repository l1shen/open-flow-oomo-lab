export type Range = readonly [Point, Point]
export type Point = {
  readonly num: number
  readonly exclusive: boolean
}

export type Splitter = {
  readonly left?: SplitterSide
  readonly right?: SplitterSide
  readonly center?: Range
}

export type SplitterSide = {
  readonly fromLeft: boolean
  readonly range: Range
}

export function splitRange(range1: Range, range2: Range): Splitter {
  const [min1] = range1
  const [min2] = range2

  if (min1.num < min2.num) {
    return splitRangeLessBranch(range1, range2)
  } else if (min1.num > min2.num) {
    return splitRangeGreaterBranch(range1, range2)
  } else {
    return splitRangeEqualsBranch(range1, range2)
  }
}

function splitRangeLessBranch(range1: Range, range2: Range): Splitter {
  const [min1, max1] = range1
  const [min2, max2] = range2

  if (max1.num <= min2.num) {
    const exclusive1 = max1.exclusive
    const exclusive2 = min2.exclusive
    if (max1.num < min2.num || exclusive1 || exclusive2) {
      return {
        left: { fromLeft: true, range: range1 },
        right: { fromLeft: false, range: range2 },
      }
    }
  }
  if (max1.num <= max2.num) {
    let hasRight = true
    let isLeftRangeOverride = false

    if (max1.num === max2.num) {
      const exclusive1 = max1.exclusive
      const exclusive2 = max2.exclusive
      hasRight = exclusive1 !== exclusive2
      isLeftRangeOverride = !exclusive1 && exclusive2
    }
    if (!isLeftRangeOverride) {
      let right: SplitterSide | undefined
      if (hasRight) {
        right = {
          fromLeft: false,
          range: [reversalExclusive(max1), max2],
        }
      }
      return {
        left: {
          fromLeft: true,
          range: [min1, reversalExclusive(min2)],
        },
        center: [min2, max1],
        right,
      }
    }
  }
  // if (max1.num > max2.num || (max1.num === max2.num && max1.exclusive === false && max2.exclusive === true))
  {
    return {
      left: {
        fromLeft: true,
        range: [min1, reversalExclusive(min2)],
      },
      center: [min2, max2],
      right: {
        fromLeft: true,
        range: [reversalExclusive(max2), max1],
      },
    }
  }
}

function splitRangeGreaterBranch(range1: Range, range2: Range): Splitter {
  const [min1, max1] = range1
  const [min2, max2] = range2

  if (min1.num >= max2.num) {
    const exclusive1 = max2.exclusive
    const exclusive2 = min1.exclusive
    if (min1.num > max2.num || exclusive1 || exclusive2) {
      return {
        left: { fromLeft: false, range: range2 },
        right: { fromLeft: true, range: range1 },
      }
    }
  }
  if (max2.num <= max1.num) {
    let hasRight = true
    let isRightRangeOverride = false

    if (max1.num === max2.num) {
      const exclusive1 = max2.exclusive
      const exclusive2 = max1.exclusive
      hasRight = exclusive1 !== exclusive2
      isRightRangeOverride = !exclusive1 && exclusive2
    }
    if (!isRightRangeOverride) {
      let right: SplitterSide | undefined
      if (hasRight) {
        right = {
          fromLeft: true,
          range: [reversalExclusive(max2), max1],
        }
      }
      return {
        left: {
          fromLeft: false,
          range: [min2, reversalExclusive(min1)],
        },
        center: [min1, max2],
        right,
      }
    }
  }
  // if (max2.num > max1.num || (max2.num === max1.num && max2.exclusive === false && max1.exclusive === true))
  {
    return {
      left: {
        fromLeft: false,
        range: [min2, reversalExclusive(min1)],
      },
      center: [min1, max1],
      right: {
        fromLeft: false,
        range: [reversalExclusive(max1), max2],
      },
    }
  }
}

function splitRangeEqualsBranch(range1: Range, range2: Range): Splitter {
  const [min1, max1] = range1
  const [min2, max2] = range2
  const exclusive1 = min1.exclusive
  const exclusive2 = min2.exclusive

  let left: SplitterSide | undefined
  let centerBegin = min1

  if (!exclusive1 && exclusive2) {
    centerBegin = min2
    left = {
      fromLeft: true,
      range: [min1, reversalExclusive(min2)],
    }
  } else if (exclusive1 && !exclusive2) {
    left = {
      fromLeft: false,
      range: [min2, reversalExclusive(min1)],
    }
  }
  if (max1.num <= max2.num) {
    let hasRight = true
    let isLeftRangeOverride = false
    if (max1.num === max2.num) {
      const maxExclusive1 = max1.exclusive
      const maxExclusive2 = max2.exclusive
      hasRight = maxExclusive1 !== maxExclusive2
      isLeftRangeOverride = !maxExclusive1 && maxExclusive2
    }
    if (!isLeftRangeOverride) {
      let right: SplitterSide | undefined
      if (hasRight) {
        right = {
          fromLeft: false,
          range: [reversalExclusive(max1), max2],
        }
      }
      return {
        left,
        center: [centerBegin, max1],
        right,
      }
    }
  }
  // if (max1.num > max2.num || (max1.num === max2.num && max1.exclusive === false && max2.exclusive === true))
  {
    return {
      left,
      center: [centerBegin, max2],
      right: {
        fromLeft: true,
        range: [reversalExclusive(max2), max1],
      },
    }
  }
}

function reversalExclusive(point: Point): Point {
  return {
    num: point.num,
    exclusive: !point.exclusive,
  }
}
