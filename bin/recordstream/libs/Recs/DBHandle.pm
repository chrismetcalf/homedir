package Recs::DBHandle;

use strict;
use warnings;

use DBI;
use Data::Dumper;
use Getopt::Long;

my $MODES = {
   'sqlite' => {
      'dbfile' => ['=s', 'testDb', 'Local file for database'],
   },
   'main' => {
      'type'     => ['=s', 'sqlite', 'Type of database to connect to'],
      'user'     => ['=s', '', 'User to connect as'],
      'password' => ['=s', '', 'Password to connect as'],
   },
};

my $DESCRIPTIONS = {
   'sqlite' => 'A simple local file based db',
};

my $DISPATCH_TABLE = {
   'sqlite' => \&sqlite_dbh,
};

sub get_dbh {
   my $options = {};

   parse_options($options, 'main');

   my $type = $options->{'type'};
   parse_options($options, $type);

   return $DISPATCH_TABLE->{$type}->($options);
}

sub parse_options {
   my $options = shift;
   my $mode    = shift;

   my $spec = get_option_spec($mode, $options);
   Getopt::Long::Configure("pass_through");
   GetOptions( %$spec );
   set_defaults($mode, $options);
}

sub set_defaults {
   my $mode = shift;
   my $opts = shift;

   my $options = $MODES->{$mode};
   foreach my $opt ( keys %$options ) {
      my $default   = @{$options->{$opt}}[1];
      $opts->{$opt} = $default unless ( exists $opts->{$opt} );
   }
}

sub get_option_spec {
   my $mode = shift;
   my $opts = shift;

   my $options = $MODES->{$mode};

   my %spec;
   foreach my $opt ( keys %$options ) {
      my ($modifier) = @{$options->{$opt}};
      $spec{$opt . $modifier} = sub { add_opt($opts, @_) };
   }

   return \%spec;
}

sub sqlite_dbh {
   my $args = shift;
   
   my $db_file  = $args->{'dbfile'};
   my $user     = $args->{'user'};
   my $password = $args->{'password'};

   my $dbh = DBI->connect("dbi:SQLite:dbname=$db_file",
                          $user,
                          $password, 
                          { RaiseError => 1, PrintError => 0 });
  
   return $dbh;
}

sub add_opt {
   my $options  = shift;
   my $arg_name = shift;
   my $value    = shift;

   $options->{$arg_name} = $value;
}

sub usage {
   print "Database Options\n";

   print_type_usage('main');

   print "Datbase types:\n";

   foreach my $type ( keys %$DESCRIPTIONS ) {
      my $description = $DESCRIPTIONS->{$type};
      print "   $type - $description\n";
   }

   print "\n";

   foreach my $type ( keys %$MODES ) {
      next if ( $type eq 'main' );
      print "Database Options for type: $type\n";
      print_type_usage($type);
   }
}

sub print_type_usage {
   my $type = shift;

   my $options = $MODES->{$type};

   foreach my $name ( keys %$options ) {
      my $description = @{$options->{$name}}[2];
      print "   $name  - $description\n";
   }

   print "\n";
}

1;
