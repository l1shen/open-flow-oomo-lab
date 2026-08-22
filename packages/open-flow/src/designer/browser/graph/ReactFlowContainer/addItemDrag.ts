const ADD_ITEM_KEY = 'application/oomol-designer/add-item'

export function getAddItemId(dataTransfer: DataTransfer): string {
  return dataTransfer.getData(ADD_ITEM_KEY)
}

export function setAddItemId(dataTransfer: DataTransfer, itemId: string): void {
  dataTransfer.setData(ADD_ITEM_KEY, itemId)
  dataTransfer.effectAllowed = 'copy'
}
