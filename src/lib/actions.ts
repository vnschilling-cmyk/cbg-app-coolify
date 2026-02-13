export function clickOutside(node: HTMLElement, callback: () => void) {
    const handleClick = (event: MouseEvent) => {
        if (
            node &&
            !node.contains(event.target as Node) &&
            !event.defaultPrevented
        ) {
            callback();
        }
    };

    setTimeout(() => {
        document.addEventListener('click', handleClick, true);
    }, 0);

    return {
        destroy() {
            document.removeEventListener('click', handleClick, true);
        },
    };
}
