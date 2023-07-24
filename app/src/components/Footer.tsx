import config from '../../config/site.config'

const createFooterMarkup = () => {
  return {
    __html: config.footer,
  }
}

const Footer = ({ BuildId }) => {
  return (
    <div className="w-full border-t border-gray-900/10 p-4 text-center text-xs font-medium text-gray-400 dark:border-gray-500/30">
      <div dangerouslySetInnerHTML={createFooterMarkup()}></div>
      <div>Build ID: <span>{BuildId}</span></div>
    </div>
  );
};

export default Footer;
