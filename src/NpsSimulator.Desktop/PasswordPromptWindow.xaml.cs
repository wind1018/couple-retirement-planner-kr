using System.Windows;

namespace NpsSimulator.Desktop;

public partial class PasswordPromptWindow : Window
{
    public PasswordPromptWindow(string prompt)
    {
        InitializeComponent();
        PromptText.Text = prompt;
        Loaded += (_, _) => PasswordInput.Focus();
    }

    public string Password => PasswordInput.Password;

    private void Confirm_Click(object sender, RoutedEventArgs e)
    {
        if (PasswordInput.Password.Length < 8)
        {
            MessageBox.Show(this, "비밀번호는 8자 이상이어야 합니다.", "입력 확인", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        DialogResult = true;
    }
}
