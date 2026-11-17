import { Menu, type MenuOption } from '../base/Menu.js'
import { IconButton } from '../base/IconButton.js'
import { IconEllipsisOutline16 } from '../base/icons.js'

/** 消息操作菜单：把编辑、删除等低频操作收进「更多」，避免操作区在手机上过挤 */
export const MessageActionsMenu = ({
  label,
  options,
}: {
  label: string
  options: MenuOption[]
}) => (
  <Menu options={options}>
    {({ toggle }) => (
      <IconButton
        icon={<IconEllipsisOutline16 />}
        tooltip={label}
        tooltipPlacement="bottom"
        onClick={toggle}
      />
    )}
  </Menu>
)
